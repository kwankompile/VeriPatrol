export class AuthRepository {
  constructor(dataSource) {
    this.dataSource = dataSource;
  }

  async logout() {
    try {
      return await this.dataSource.logout();
    } catch (error) {
      console.error('Error during logout:', error);
      throw error;
    }
  }

  async refreshSession() {
    try {
      return await this.dataSource.refresh();
    } catch (error) {
      console.error('Error during refresh:', error);
      throw error;
    }
  }

  async completePasswordSetup(payload) {
    try {
      return await this.dataSource.completePasswordSetup(payload);
    } catch (error) {
      console.error('Error during password setup:', error);
      throw error;
    }
  }

  async startTwoFactorSetup(payload) {
    try {
      return await this.dataSource.startTwoFactorSetup(payload);
    } catch (error) {
      console.error('Error during two-factor setup start:', error);
      throw error;
    }
  }

  async verifyTwoFactorSetup(payload) {
    try {
      return await this.dataSource.verifyTwoFactorSetup(payload);
    } catch (error) {
      console.error('Error during two-factor setup verify:', error);
      throw error;
    }
  }

  async verifyOtp(payload) {
    try {
      return await this.dataSource.verifyOtp(payload);
    } catch (error) {
      console.error('Error during OTP verification:', error);
      throw error;
    }
  }
}
