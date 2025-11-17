module.exports = {
  BOT_STATUS: {
    ACTIVE: 'active',
    MAINTENANCE: 'maintenance'
  },
  
  USER: {
    STATUS: {
      ACTIVE: 'active',
      BLOCKED: 'blocked',
      PENDING: 'pending'
    }
  },
  
  PAYMENT: {
    STATUS: {
      PENDING: 'pending',
      APPROVED: 'approved',
      REJECTED: 'rejected'
    },
    DEFAULT_AMOUNT: 500
  },
  
  WITHDRAWAL: {
    MIN_PAID_REFERRALS: 4,
    MIN_AMOUNT: 100,
    COMMISSION_PER_REFERRAL: 250,
    STATUS: {
      PENDING: 'pending',
      APPROVED: 'approved',
      REJECTED: 'rejected'
    }
  },
  
  ADMIN: {
    ROLES: {
      SUPER_ADMIN: 'super_admin',
      ADMIN: 'admin',
      MODERATOR: 'moderator'
    }
  }
};
