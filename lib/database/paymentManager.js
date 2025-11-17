const { db } = require('../../config/firebase');
const CONSTANTS = require('../../config/constants');

class PaymentManager {
  async createPayment(userId, screenshotFileId, amount = CONSTANTS.PAYMENT.DEFAULT_AMOUNT) {
    try {
      const paymentId = `PAY_${userId}_${Date.now()}`;
      
      const paymentData = {
        paymentId: paymentId,
        userId: userId,
        screenshotFileId: screenshotFileId,
        amount: amount,
        status: CONSTANTS.PAYMENT.STATUS.PENDING,
        submittedAt: new Date().toISOString(),
        method: 'telebirr' // Default method
      };
      
      await db.collection('payments').doc(paymentId).set(paymentData);
      return paymentData;
    } catch (error) {
      console.error('Error creating payment:', error);
      throw error;
    }
  }

  async approvePayment(paymentId, adminUsername) {
    try {
      const paymentDoc = await db.collection('payments').doc(paymentId).get();
      if (!paymentDoc.exists) throw new Error('Payment not found');
      
      const payment = paymentDoc.data();
      
      // Update payment status
      await db.collection('payments').doc(paymentId).update({
        status: CONSTANTS.PAYMENT.STATUS.APPROVED,
        verifiedBy: adminUsername,
        verifiedAt: new Date().toISOString()
      });
      
      return payment;
    } catch (error) {
      console.error('Error approving payment:', error);
      throw error;
    }
  }

  async rejectPayment(paymentId, reason, adminUsername) {
    try {
      await db.collection('payments').doc(paymentId).update({
        status: CONSTANTS.PAYMENT.STATUS.REJECTED,
        rejectionReason: reason,
        verifiedBy: adminUsername,
        verifiedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error rejecting payment:', error);
      throw error;
    }
  }

  async getPendingPayments() {
    try {
      const paymentsSnapshot = await db.collection('payments')
        .where('status', '==', CONSTANTS.PAYMENT.STATUS.PENDING)
        .orderBy('submittedAt', 'asc')
        .get();

      return paymentsSnapshot.docs.map(doc => doc.data());
    } catch (error) {
      console.error('Error getting pending payments:', error);
      return [];
    }
  }

  async createWithdrawal(userId, amount, paymentMethod, accountNumber) {
    try {
      const withdrawalId = `WD_${userId}_${Date.now()}`;
      
      const withdrawalData = {
        withdrawalId: withdrawalId,
        userId: userId,
        amount: amount,
        paymentMethod: paymentMethod,
        accountNumber: accountNumber,
        status: CONSTANTS.WITHDRAWAL.STATUS.PENDING,
        requestedAt: new Date().toISOString()
      };
      
      await db.collection('withdrawals').doc(withdrawalId).set(withdrawalData);
      return withdrawalData;
    } catch (error) {
      console.error('Error creating withdrawal:', error);
      throw error;
    }
  }

  async approveWithdrawal(withdrawalId, adminUsername) {
    try {
      const withdrawalDoc = await db.collection('withdrawals').doc(withdrawalId).get();
      if (!withdrawalDoc.exists) throw new Error('Withdrawal not found');
      
      const withdrawal = withdrawalDoc.data();
      
      // Update withdrawal status
      await db.collection('withdrawals').doc(withdrawalId).update({
        status: CONSTANTS.WITHDRAWAL.STATUS.APPROVED,
        processedBy: adminUsername,
        processedAt: new Date().toISOString()
      });
      
      return withdrawal;
    } catch (error) {
      console.error('Error approving withdrawal:', error);
      throw error;
    }
  }

  async rejectWithdrawal(withdrawalId, reason, adminUsername) {
    try {
      await db.collection('withdrawals').doc(withdrawalId).update({
        status: CONSTANTS.WITHDRAWAL.STATUS.REJECTED,
        rejectionReason: reason,
        processedBy: adminUsername,
        processedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error rejecting withdrawal:', error);
      throw error;
    }
  }

  async getPendingWithdrawals() {
    try {
      const withdrawalsSnapshot = await db.collection('withdrawals')
        .where('status', '==', CONSTANTS.WITHDRAWAL.STATUS.PENDING)
        .orderBy('requestedAt', 'asc')
        .get();

      return withdrawalsSnapshot.docs.map(doc => doc.data());
    } catch (error) {
      console.error('Error getting pending withdrawals:', error);
      return [];
    }
  }
}

module.exports = new PaymentManager();
