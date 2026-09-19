import { resolveProfilePictureUrl } from 'utils/getImageUrl';

export class UserRepository {
  constructor(dataSource) {
    this.dataSource = dataSource;
  }

  async getAllUsers() {
    try {
      return await this.dataSource.getAllUsers();
    } catch (error) {
      console.error('Error fetching users:', error);
      throw error;
    }
  }

  async getUserById(userId) {
    try {
      return await this.dataSource.getUserById(userId);
    } catch (error) {
      console.error('Error fetching user:', error);
      throw error;
    }
  }

  async getRoles() {
    try {
      return await this.dataSource.getRoles();
    } catch (error) {
      console.error('Error fetching roles:', error);
      throw error;
    }
  }

  async createUser(userData) {
    try {
      return await this.dataSource.createUser(userData);
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  async updateUser(userId, userData) {
    try {
      return await this.dataSource.updateUser(userId, userData);
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  async deleteUser(userId) {
    try {
      return await this.dataSource.deleteUser(userId);
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  }

  normalizeUser(payload) {
    const user = payload?.data ?? payload ?? null;
    if (!user) return null;
    return {
      ...user,
      profile_picture_url: resolveProfilePictureUrl(user.profile_picture_url ?? null)
    };
  }

  normalizeRolesList(payload) {
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload)) return payload;
    return [];
  }

  filterUsers(users, searchText) {
    if (!searchText) return users;

    const lowerSearch = searchText.toLowerCase();
    return users.filter((user) => {
      const name = user.name || '';
      const email = user.email || '';
      const phone = user.phone || '';
      const roleName = user.role?.name || '';

      return (
        name.toLowerCase().includes(lowerSearch) ||
        email.toLowerCase().includes(lowerSearch) ||
        phone.includes(searchText) ||
        roleName.toLowerCase().includes(lowerSearch)
      );
    });
  }

  paginateUsers(users, page, rowsPerPage) {
    const start = page * rowsPerPage;
    const end = start + rowsPerPage;
    return users.slice(start, end);
  }
}
