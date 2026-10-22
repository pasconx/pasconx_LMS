import { supabase } from '../config/supabase.js';

export async function seedSupabase() {
  console.log('--- Initializing Supabase Demo Accounts & Content ---');
  if (!supabase) {
    console.error('Supabase client is not configured.');
    return;
  }

  // 1. Setup Admin Account
  const adminEmail = 'admin@pasconx.com';
  const adminPassword = 'Admin@12345';

  const { data: userList } = await supabase.auth.admin.listUsers();
  const existingUsers = userList?.users || [];

  let adminUser = existingUsers.find((u) => u.email === adminEmail);
  if (!adminUser) {
    const { data: newAdmin, error: adminErr } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true
    });
    if (adminErr) {
      console.error('Failed to create admin in Supabase Auth:', adminErr.message);
    } else {
      adminUser = newAdmin.user;
    }
  } else {
    await supabase.auth.admin.updateUserById(adminUser.id, { password: adminPassword });
  }

  if (adminUser) {
    const { error: profileErr } = await supabase.from('profiles').upsert({
      id: adminUser.id,
      email: adminEmail,
      name: 'PASCONX Admin',
      role: 'ADMIN',
      status: 'ACTIVE'
    });
    if (profileErr) {
      console.error('Failed to upsert admin profile:', profileErr.message);
    } else {
      console.log(`[Admin Account Ready]: ${adminEmail} / ${adminPassword} (UUID: ${adminUser.id})`);
    }
  }

  // 2. Setup Student Account
  const studentEmail = 'student@pasconx.com';
  const studentPassword = 'Student@12345';

  let studentUser = existingUsers.find((u) => u.email === studentEmail);
  if (!studentUser) {
    const { data: newStudent, error: studentErr } = await supabase.auth.admin.createUser({
      email: studentEmail,
      password: studentPassword,
      email_confirm: true
    });
    if (studentErr) {
      console.error('Failed to create student in Supabase Auth:', studentErr.message);
    } else {
      studentUser = newStudent.user;
    }
  } else {
    await supabase.auth.admin.updateUserById(studentUser.id, { password: studentPassword });
  }

  if (studentUser) {
    const { error: sProfileErr } = await supabase.from('profiles').upsert({
      id: studentUser.id,
      email: studentEmail,
      name: 'PASCONX Student',
      role: 'STUDENT',
      status: 'ACTIVE'
    });
    if (sProfileErr) {
      console.error('Failed to upsert student profile:', sProfileErr.message);
    } else {
      console.log(`[Student Account Ready]: ${studentEmail} / ${studentPassword} (UUID: ${studentUser.id})`);
    }
  }

  console.log('--- Supabase Seeding Finished ---');
}

if (process.argv[1] && process.argv[1].endsWith('seedSupabase.js')) {
  seedSupabase().then(() => process.exit(0)).catch((err) => {
    console.error('Seeding error:', err);
    process.exit(1);
  });
}
