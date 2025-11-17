const { db } = require('../../config/firebase');
const CONSTANTS = require('../../config/constants');

class UserManager {
  async getUser(userId) {
    try {
      const userDoc = await db.collection('users').doc(userId.toString()).get();
      return userDoc.exists ? userDoc.data() : null;
    } catch (error) {
      console.error('Error getting user:', error);
      return null;
    }
  }

  async createUser(userId, userInfo) {
    try {
      const referralCode = this.generateReferralCode(userInfo.first_name);
      
      const userData = {
        telegramId: userId,
        username: userInfo.username,
        firstName: userInfo.first_name,
        lastName: userInfo.last_name || '',
        language: 'en',
        status: CONSTANTS.USER.STATUS.ACTIVE,
        balance: 0,
        totalEarned: 0,
        totalWithdrawn: 0,
        paidReferrals: 0,
        unpaidReferrals: 0,
        totalReferrals: 0,
        referralCode: referralCode,
        registrationDate: new Date().toISOString(),
        lastSeen: new Date().toISOString()
      };
      
      await db.collection('users').doc(userId.toString()).set(userData);
      return userData;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  async updateUser(userId, updates) {
    try {
      updates.lastSeen = new Date().toISOString();
      await db.collection('users').doc(userId.toString()).update(updates);
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  async addReferral(referrerId, referredUserId) {
    try {
      const referrer = await this.getUser(referrerId);
      if (!referrer) return;

      await db.collection('referrals').add({
        referrerId: referrerId,
        referredUserId: referredUserId,
        status: 'pending',
        date: new Date().toISOString()
      });

      // Update referrer stats
      await this.updateUser(referrerId, {
        totalReferrals: (referrer.totalReferrals || 0) + 1,
        unpaidReferrals: (referrer.unpaidReferrals || 0) + 1
      });
    } catch (error) {
      console.error('Error adding referral:', error);
    }
  }

  async markReferralAsPaid(referrerId, referredUserId) {
    try {
      // Update referral status
      const referralsSnapshot = await db.collection('referrals')
        .where('referrerId', '==', referrerId)
        .where('referredUserId', '==', referredUserId)
        .get();

      if (!referralsSnapshot.empty) {
        const referralDoc = referralsSnapshot.docs[0];
        await referralDoc.ref.update({ status: 'paid' });
      }

      // Update user stats
      const referrer = await this.getUser(referrerId);
      if (referrer) {
        const newBalance = (referrer.balance || 0) + CONSTANTS.WITHDRAWAL.COMMISSION_PER_REFERRAL;
        
        await this.updateUser(referrerId, {
          paidReferrals: (referrer.paidReferrals || 0) + 1,
          unpaidReferrals: Math.max(0, (referrer.unpaidReferrals || 1) - 1),
          balance: newBalance,
          totalEarned: (referrer.totalEarned || 0) + CONSTANTS.WITHDRAWAL.COMMISSION_PER_REFERRAL
        });
      }
    } catch (error) {
      console.error('Error marking referral as paid:', error);
    }
  }

  generateReferralCode(firstName) {
    const randomNum = Math.floor(100 + Math.random() * 900);
    return `${firstName.substring(0, 3).toUpperCase()}${randomNum}`;
  }

  async getTopUsers(limit = 10) {
    try {
      const usersSnapshot = await db.collection('users')
        .where('paidReferrals', '>=', 1)
        .orderBy('paidReferrals', 'desc')
        .limit(limit)
        .get();

      return usersSnapshot.docs.map(doc => doc.data());
    } catch (error) {
      console.error('Error getting top users:', error);
      return [];
    }
  }

  async blockUser(userId, reason = '') {
    try {
      await this.updateUser(userId, {
        status: CONSTANTS.USER.STATUS.BLOCKED,
        blockReason: reason,
        blockedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error blocking user:', error);
      throw error;
    }
  }

  async unblockUser(userId) {
    try {
      await this.updateUser(userId, {
        status: CONSTANTS.USER.STATUS.ACTIVE,
        blockReason: null,
        blockedAt: null
      });
    } catch (error) {
      console.error('Error unblocking user:', error);
      throw error;
    }
  }
}

module.exports = new UserManager();
