export const userDataSource = {
  fetchUsers: async () => {
    return [
      {
        id: '1',
        name: 'Muhammad Ikhwan Arifi Bin Ismail',
        phoneNum: '601129212658',
        email: '2024692584@student.uitm.edu.my',
        homeAddress: 'No. 123, Jalan Bukit Bintang, 55100 Kuala Lumpur',
        role: 'Administrator',
        profilePicture: 'https://ui-avatars.com/api/?name=Muhammad+Ikhwan&size=200&background=random',
        lastModified: '10/05/2025, 12:30 PM'
      },
      {
        id: '2',
        name: 'Ahmad Faiz Bin Abdullah',
        phoneNum: '601123456789',
        email: 'ahmad.faiz@student.uitm.edu.my',
        homeAddress: 'Lot 456, Taman Melawati, 53100 Kuala Lumpur',
        role: 'Guard',
        profilePicture: 'https://ui-avatars.com/api/?name=Ahmad+Faiz&size=200&background=random',
        lastModified: '09/05/2025, 10:15 AM'
      },
      {
        id: '3',
        name: 'Siti Nurhaliza Binti Hassan',
        phoneNum: '601198765432',
        email: 'siti.nurhaliza@student.uitm.edu.my',
        homeAddress: 'No. 789, Jalan Ampang, 50450 Kuala Lumpur',
        role: 'Operator',
        profilePicture: 'https://ui-avatars.com/api/?name=Siti+Nurhaliza&size=200&background=random',
        lastModified: '08/05/2025, 02:45 PM'
      },
      {
        id: '4',
        name: 'Lee Wei Ming',
        phoneNum: '601156789012',
        email: 'lee.weiming@student.uitm.edu.my',
        homeAddress: 'Block B-12-5, Condominium Setia Sky, 56000 Kuala Lumpur',
        role: 'Guard',
        profilePicture: 'https://ui-avatars.com/api/?name=Lee+Wei+Ming&size=200&background=random',
        lastModified: '07/05/2025, 11:20 AM'
      },
      {
        id: '5',
        name: 'Raj Kumar A/L Subramaniam',
        phoneNum: '601134567890',
        email: 'raj.kumar@student.uitm.edu.my',
        homeAddress: 'No. 234, Jalan Gasing, 46000 Petaling Jaya',
        role: 'Operator',
        profilePicture: 'https://ui-avatars.com/api/?name=Raj+Kumar&size=200&background=random',
        lastModified: '06/05/2025, 09:30 AM'
      },
      {
        id: '6',
        name: 'Nurul Aina Binti Ismail',
        phoneNum: '601145678901',
        email: 'nurul.aina@student.uitm.edu.my',
        homeAddress: 'No. 567, Taman Desa, 58100 Kuala Lumpur',
        role: 'Guard',
        profilePicture: 'https://ui-avatars.com/api/?name=Nurul+Aina&size=200&background=random',
        lastModified: '05/05/2025, 03:15 PM'
      }
    ];
  },

  fetchUserById: async (userId) => {
    const users = await userDataSource.fetchUsers();
    return users.find((user) => user.id === userId);
  },

  createUser: async (userData) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const newUser = {
      id: Date.now().toString(),
      ...userData,
      profilePicture:
        userData.profilePicture || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name)}&size=200&background=random`,
      lastModified: new Date().toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      })
    };
    return { success: true, data: newUser };
  },

  updateUser: async (userId, userData) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return {
      success: true,
      data: {
        id: userId,
        ...userData,
        lastModified: new Date().toLocaleString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        })
      }
    };
  },

  deleteUser: async (userId) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { success: true, id: userId };
  }
};
