const { bot } = require('../../api/bot');
const UserManager = require('../database/userManager');

class NotificationService {
  async notifyAdmins(message, keyboard = null) {
    try {
      const adminIds = process.env.ADMIN_IDS?.split(',') || [];
      
      for (const adminId of adminIds) {
        try {
          if (keyboard) {
            await bot.telegram.sendMessage(adminId, message, {
              parse_mode: 'Markdown',
              reply_markup: keyboard
            });
          } else {
            await bot.telegram.sendMessage(adminId, message, {
              parse_mode: 'Markdown'
            });
          }
        } catch (error) {
          console.error(`Failed to notify admin ${adminId}:`, error);
        }
      }
    } catch (error) {
      console.error('Error in notifyAdmins:', error);
    }
  }

  async notifyPaymentSubmission(userId, paymentId, screenshotFileId) {
    const user = await UserManager.getUser(userId);
    if (!user) return;

    const message = `📸 *NEW PAYMENT SUBMISSION*\n\n` +
      `👤 User: ${user.firstName} ${user.lastName || ''}\n` +
      `📱 Username: @${user.username || 'N/A'}\n` +
      `🆔 User ID: ${userId}\n` +
      `💰 Amount: ${500} ETB\n` +
      `🆔 Payment ID: ${paymentId}\n\n` +
      `*Quick Actions:*`;

    const { Markup } = require('telegraf');
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Approve', `approve_payment_${paymentId}`),
        Markup.button.callback('❌ Reject', `reject_payment_${paymentId}`)
      ],
      [
        Markup.button.callback('📩 Message User', `message_user_${userId}`),
        Markup.button.callback('👀 View User', `view_user_${userId}`)
      ]
    ]);

    // Send notification
    await this.notifyAdmins(message, keyboard.reply_markup);

    // Forward screenshot
    for (const adminId of process.env.ADMIN_IDS?.split(',') || []) {
      try {
        await bot.telegram.forwardMessage(adminId, userId, screenshotFileId);
      } catch (error) {
        console.error(`Failed to forward screenshot to admin ${adminId}:`, error);
      }
    }
  }

  async notifyWithdrawalRequest(userId, withdrawalId, amount) {
    const user = await UserManager.getUser(userId);
    if (!user) return;

    const message = `💰 *NEW WITHDRAWAL REQUEST*\n\n` +
      `👤 User: ${user.firstName} ${user.lastName || ''}\n` +
      `📱 Username: @${user.username || 'N/A'}\n` +
      `🆔 User ID: ${userId}\n` +
      `💵 Amount: ${amount} ETB\n` +
      `📊 Paid Referrals: ${user.paidReferrals}\n` +
      `💰 Current Balance: ${user.balance} ETB\n` +
      `🆔 Withdrawal ID: ${withdrawalId}\n\n` +
      `*Quick Actions:*`;

    const { Markup } = require('telegraf');
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Approve', `approve_withdrawal_${withdrawalId}`),
        Markup.button.callback('❌ Reject', `reject_withdrawal_${withdrawalId}`)
      ],
      [
        Markup.button.callback('📩 Message User', `message_user_${userId}`),
        Markup.button.callback('👀 View Details', `view_withdrawal_${withdrawalId}`)
      ]
    ]);

    await this.notifyAdmins(message, keyboard.reply_markup);
  }

  async notifyUser(userId, message) {
    try {
      await bot.telegram.sendMessage(userId, message, {
        parse_mode: 'Markdown'
      });
    } catch (error) {
      console.error(`Failed to notify user ${userId}:`, error);
    }
  }
}

module.exports = new NotificationService();
