require('dotenv').config();
const { Telegraf, session, Markup } = require('telegraf');

// Import managers and services
const languageService = require('../lib/services/languageService');
const UserManager = require('../lib/database/userManager');
const PaymentManager = require('../lib/database/paymentManager');
const NotificationService = require('../lib/services/notificationService');
const CONSTANTS = require('../config/constants');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Middleware
bot.use(session());
bot.use(async (ctx, next) => {
  ctx.userData = await UserManager.getUser(ctx.from.id);
  ctx.language = ctx.userData?.language || 'en';
  ctx.t = (key, variables) => languageService.getText(ctx.language, key, variables);
  
  // Check if user is blocked
  if (ctx.userData?.status === CONSTANTS.USER.STATUS.BLOCKED) {
    await ctx.reply(ctx.t('errors.user_blocked'));
    return;
  }
  
  await next();
});

// Helper functions
function isAdmin(userId) {
  const adminIds = process.env.ADMIN_IDS?.split(',') || [];
  return adminIds.includes(userId.toString());
}

// Start command
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  
  if (!ctx.userData) {
    // New user registration
    await UserManager.createUser(userId, ctx.from);
    
    // Check if user was referred
    const referredBy = ctx.payload; // referral code from deep link
    if (referredBy) {
      // Find referrer by code and add referral
      const usersSnapshot = await require('../config/firebase').db
        .collection('users')
        .where('referralCode', '==', referredBy)
        .get();
      
      if (!usersSnapshot.empty) {
        const referrer = usersSnapshot.docs[0].data();
        await UserManager.addReferral(referrer.telegramId, userId);
      }
    }
    
    await ctx.reply(ctx.t('welcome'));
  }
  
  await showMainMenu(ctx);
});

// Main menu command
bot.command('menu', async (ctx) => {
  await showMainMenu(ctx);
});

async function showMainMenu(ctx) {
  const menuText = `🎯 *Main Menu*\n\nChoose an option:`;
  
  const keyboard = Markup.keyboard([
    [ctx.t('menu.balance'), ctx.t('menu.referrals')],
    [ctx.t('menu.leaderboard'), ctx.t('menu.withdraw')],
    [isAdmin(ctx.from.id) ? ctx.t('menu.admin') : ctx.t('menu.settings')]
  ]).resize();
  
  await ctx.replyWithMarkdown(menuText, keyboard);
}

// Balance command
bot.command('balance', async (ctx) => {
  const user = await UserManager.getUser(ctx.from.id);
  if (!user) return ctx.reply('Please use /start first.');
  
  const needed = CONSTANTS.WITHDRAWAL.MIN_PAID_REFERRALS - user.paidReferrals;
  const eligible = user.paidReferrals >= CONSTANTS.WITHDRAWAL.MIN_PAID_REFERRALS;
  
  const balanceText = `💰 *Your Balance*\n\n` +
    `💵 Available Balance: *${user.balance} ETB*\n` +
    `📈 Total Earned: *${user.totalEarned} ETB*\n` +
    `📉 Total Withdrawn: *${user.totalWithdrawn} ETB*\n\n` +
    `👥 Referral Stats:\n` +
    `✅ Paid Referrals: *${user.paidReferrals}*\n` +
    `⏳ Unpaid Referrals: *${user.unpaidReferrals}*\n` +
    `📊 Total Referrals: *${user.totalReferrals}*\n\n` +
    (eligible ? 
      `🎉 *You are eligible for withdrawal!*` : 
      `❌ Need *${needed}* more paid referrals to withdraw`);
  
  await ctx.replyWithMarkdown(balanceText);
});

// Referrals command
bot.command('referrals', async (ctx) => {
  const user = await UserManager.getUser(ctx.from.id);
  if (!user) return ctx.reply('Please use /start first.');
  
  const referralText = `👥 *Your Referral Network*\n\n` +
    `Your Referral Code: \`${user.referralCode}\`\n\n` +
    `Share this link to invite friends:\n` +
    `https://t.me/${process.env.BOT_USERNAME}?start=${user.referralCode}\n\n` +
    `You earn *${CONSTANTS.WITHDRAWAL.COMMISSION_PER_REFERRAL} ETB* for each paid referral!`;
  
  await ctx.replyWithMarkdown(referralText);
});

// Leaderboard command
bot.command('leaderboard', async (ctx) => {
  const topUsers = await UserManager.getTopUsers(6);
  const currentUser = await UserManager.getUser(ctx.from.id);
  
  let leaderboardText = `🏆 *Top Referrers*\n\n`;
  
  if (topUsers.length === 0) {
    leaderboardText += `No users on leaderboard yet. Be the first!`;
  } else {
    topUsers.forEach((user, index) => {
      const rankEmoji = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣'][index];
      leaderboardText += `${rankEmoji} *${user.firstName}* - ${user.paidReferrals} paid referrals\n`;
    });
  }
  
  leaderboardText += `\nYour position: ${currentUser.paidReferrals} paid referrals`;
  
  await ctx.replyWithMarkdown(leaderboardText);
});

// Withdrawal command
bot.command('withdraw', async (ctx) => {
  const user = await UserManager.getUser(ctx.from.id);
  if (!user) return ctx.reply('Please use /start first.');
  
  // Check eligibility
  if (user.paidReferrals < CONSTANTS.WITHDRAWAL.MIN_PAID_REFERRALS) {
    const needed = CONSTANTS.WITHDRAWAL.MIN_PAID_REFERRALS - user.paidReferrals;
    return ctx.reply(
      `❌ *Withdrawal Not Eligible*\n\n` +
      `You need *${CONSTANTS.WITHDRAWAL.MIN_PAID_REFERRALS}* paid referrals to withdraw.\n` +
      `You have *${user.paidReferrals}* paid referrals.\n` +
      `Need *${needed}* more paid referrals.`
    );
  }
  
  if (user.balance < CONSTANTS.WITHDRAWAL.MIN_AMOUNT) {
    return ctx.reply(
      `❌ *Insufficient Balance*\n\n` +
      `Minimum withdrawal amount: *${CONSTANTS.WITHDRAWAL.MIN_AMOUNT} ETB*\n` +
      `Your balance: *${user.balance} ETB*`
    );
  }
  
  const withdrawalText = `💸 *Request Withdrawal*\n\n` +
    `Available Balance: *${user.balance} ETB*\n` +
    `Minimum Withdrawal: *${CONSTANTS.WITHDRAWAL.MIN_AMOUNT} ETB*\n\n` +
    `Please send the withdrawal amount and payment details in this format:\n\n` +
    `\`Amount|PaymentMethod|AccountNumber\`\n\n` +
    `*Example:*\n` +
    `\`1000|telebirr|251912345678\``;
  
  ctx.session.waitingForWithdrawal = true;
  await ctx.replyWithMarkdown(withdrawalText);
});

// Handle withdrawal details
bot.on('text', async (ctx) => {
  if (ctx.session.waitingForWithdrawal) {
    const input = ctx.message.text.trim();
    const [amount, paymentMethod, accountNumber] = input.split('|');
    
    if (!amount || !paymentMethod || !accountNumber) {
      return ctx.reply('❌ Invalid format. Please use: Amount|PaymentMethod|AccountNumber');
    }
    
    const numericAmount = parseInt(amount);
    const user = await UserManager.getUser(ctx.from.id);
    
    if (isNaN(numericAmount) || numericAmount < CONSTANTS.WITHDRAWAL.MIN_AMOUNT) {
      return ctx.reply(`❌ Amount must be at least ${CONSTANTS.WITHDRAWAL.MIN_AMOUNT} ETB`);
    }
    
    if (numericAmount > user.balance) {
      return ctx.reply(`❌ Amount exceeds your available balance of ${user.balance} ETB`);
    }
    
    try {
      const withdrawal = await PaymentManager.createWithdrawal(
        ctx.from.id, 
        numericAmount, 
        paymentMethod, 
        accountNumber
      );
      
      await NotificationService.notifyWithdrawalRequest(
        ctx.from.id, 
        withdrawal.withdrawalId, 
        numericAmount
      );
      
      await ctx.reply(
        `✅ *Withdrawal Request Submitted!*\n\n` +
        `Amount: *${numericAmount} ETB*\n` +
        `Method: *${paymentMethod}*\n` +
        `Account: *${accountNumber}*\n\n` +
        `Admins have been notified. You will receive an update soon.`
      );
      
      ctx.session.waitingForWithdrawal = false;
    } catch (error) {
      await ctx.reply('❌ Error processing withdrawal request. Please try again.');
    }
  }
});

// Payment screenshot handling
bot.on('photo', async (ctx) => {
  const user = await UserManager.getUser(ctx.from.id);
  if (!user) return;
  
  const photo = ctx.message.photo[ctx.message.photo.length - 1];
  const fileId = photo.file_id;
  
  try {
    const payment = await PaymentManager.createPayment(ctx.from.id, fileId);
    
    await NotificationService.notifyPaymentSubmission(
      ctx.from.id, 
      payment.paymentId, 
      fileId
    );
    
    await ctx.reply(
      `✅ *Payment Screenshot Received!*\n\n` +
      `Admins have been notified and will verify your payment shortly.\n` +
      `Payment ID: \`${payment.paymentId}\``
    );
  } catch (error) {
    await ctx.reply('❌ Error processing payment screenshot. Please try again.');
  }
});

// ADMIN FEATURES
if (isAdmin('1')) { // Only setup admin features if there are admins
  // Admin command
  bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply(ctx.t('errors.access_denied'));
    }
    
    const stats = await getAdminStats();
    
    const adminText = `🔧 *Admin Dashboard*\n\n` +
      `📊 *Statistics*\n` +
      `👥 Total Users: ${stats.totalUsers}\n` +
      `💰 Total Payments: ${stats.totalPayments}\n` +
      `⏳ Pending Payments: ${stats.pendingPayments}\n` +
      `💸 Pending Withdrawals: ${stats.pendingWithdrawals}\n\n` +
      `⚡ *Quick Actions*`;
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('📸 Pending Payments', 'admin_pending_payments'),
        Markup.button.callback('💸 Pending Withdrawals', 'admin_pending_withdrawals')
      ],
      [
        Markup.button.callback('👥 User Management', 'admin_user_management'),
        Markup.button.callback('📊 Analytics', 'admin_analytics')
      ],
      [
        Markup.button.callback('⚙️ Bot Settings', 'admin_bot_settings'),
        Markup.button.callback('📢 Broadcast', 'admin_broadcast')
      ]
    ]);
    
    await ctx.replyWithMarkdown(adminText, keyboard);
  });
  
  // Admin callback handlers
  bot.action('admin_pending_payments', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    const pendingPayments = await PaymentManager.getPendingPayments();
    
    if (pendingPayments.length === 0) {
      return ctx.editMessageText('✅ No pending payments.');
    }
    
    for (const payment of pendingPayments.slice(0, 5)) {
      const user = await UserManager.getUser(payment.userId);
      const paymentText = `📸 *Pending Payment*\n\n` +
        `👤 User: ${user.firstName}\n` +
        `💰 Amount: ${payment.amount} ETB\n` +
        `🆔 Payment ID: ${payment.paymentId}\n` +
        `📅 Submitted: ${new Date(payment.submittedAt).toLocaleString()}`;
      
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Approve', `approve_payment_${payment.paymentId}`),
          Markup.button.callback('❌ Reject', `reject_payment_${payment.paymentId}`)
        ]
      ]);
      
      await ctx.replyWithMarkdown(paymentText, keyboard);
      
      // Forward screenshot
      try {
        await ctx.telegram.forwardMessage(ctx.from.id, payment.userId, payment.screenshotFileId);
      } catch (error) {
        console.error('Error forwarding screenshot:', error);
      }
    }
  });
  
  // Payment approval handler
  bot.action(/approve_payment_(.+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    const paymentId = ctx.match[1];
    
    try {
      const payment = await PaymentManager.approvePayment(paymentId, ctx.from.username);
      
      // Mark referral as paid
      await UserManager.markReferralAsPaid(payment.userId, payment.userId);
      
      await NotificationService.notifyUser(
        payment.userId,
        `🎉 *Payment Approved!*\n\nYour payment has been verified and your balance has been updated.`
      );
      
      await ctx.editMessageText(`✅ Payment ${paymentId} approved successfully!`);
    } catch (error) {
      await ctx.editMessageText('❌ Error approving payment.');
    }
  });
  
  // Withdrawal approval handler
  bot.action(/approve_withdrawal_(.+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    const withdrawalId = ctx.match[1];
    
    try {
      const withdrawal = await PaymentManager.approveWithdrawal(withdrawalId, ctx.from.username);
      
      // Update user balance
      const user = await UserManager.getUser(withdrawal.userId);
      await UserManager.updateUser(withdrawal.userId, {
        balance: (user.balance || 0) - withdrawal.amount,
        totalWithdrawn: (user.totalWithdrawn || 0) + withdrawal.amount
      });
      
      await NotificationService.notifyUser(
        withdrawal.userId,
        `🎉 *Withdrawal Approved!*\n\nYour withdrawal of ${withdrawal.amount} ETB has been approved and will be processed soon.`
      );
      
      await ctx.editMessageText(`✅ Withdrawal ${withdrawalId} approved successfully!`);
    } catch (error) {
      await ctx.editMessageText('❌ Error approving withdrawal.');
    }
  });
}

// Helper function for admin stats
async function getAdminStats() {
  const { db } = require('../config/firebase');
  
  try {
    const usersSnapshot = await db.collection('users').get();
    const paymentsSnapshot = await db.collection('payments').get();
    const withdrawalsSnapshot = await db.collection('withdrawals').get();
    
    const pendingPayments = paymentsSnapshot.docs.filter(doc => 
      doc.data().status === CONSTANTS.PAYMENT.STATUS.PENDING
    );
    
    const pendingWithdrawals = withdrawalsSnapshot.docs.filter(doc => 
      doc.data().status === CONSTANTS.WITHDRAWAL.STATUS.PENDING
    );
    
    return {
      totalUsers: usersSnapshot.size,
      totalPayments: paymentsSnapshot.size,
      pendingPayments: pendingPayments.length,
      pendingWithdrawals: pendingWithdrawals.length
    };
  } catch (error) {
    console.error('Error getting admin stats:', error);
    return { totalUsers: 0, totalPayments: 0, pendingPayments: 0, pendingWithdrawals: 0 };
  }
}

// Help command
bot.help((ctx) => {
  ctx.replyWithMarkdown(`
🤖 *JU Registration Bot Help*

*Main Commands:*
/start - Start the bot
/menu - Show main menu
/balance - Check your balance & referrals
/referrals - Get your referral link
/leaderboard - See top users
/withdraw - Request withdrawal

*Payment:*
Simply send a screenshot of your payment receipt.

*Support:*
Contact the admin if you need help.
  `);
});

// Export for Vercel
module.exports = async (req, res) => {
  try {
    await bot.handleUpdate(req.body);
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error handling update:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// For local development
if (process.env.NODE_ENV !== 'production') {
  bot.launch().then(() => {
    console.log('🤖 JU Registration Bot is running!');
  });
}

// Export bot instance for other modules
module.exports.bot = bot;
