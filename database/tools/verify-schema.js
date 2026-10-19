const { getConnection } = require('./db-config');

async function runVerify() {
  const conn = await getConnection();
  const results = [];

  function record(id, description, passed, error = null) {
    results.push({ id, description, passed, error: error ? error.message : null });
  }

  try {
    // -------------------------------------------------------------------------
    // Case 1: 40-character prefixed ids and seed-style ids are accepted
    // -------------------------------------------------------------------------
    await conn.beginTransaction();
    try {
      const seedId = 'u_seed_1';
      const maxId = 'u_' + 'x'.repeat(38); // Exactly 40 chars: 'u_' (2) + 38 chars = 40 chars
      await conn.query(
        `INSERT INTO users (id, full_name, username, email, password_hash)
         VALUES (?, 'Seed User', 'seed_user', 'seed@example.com', 'hash'),
                (?, 'Max User', 'max_user', 'max@example.com', 'hash')`,
        [seedId, maxId]
      );
      const [rows] = await conn.query('SELECT id FROM users WHERE id IN (?, ?)', [seedId, maxId]);
      if (rows.length === 2 && rows.some(r => r.id === maxId && r.id.length === 40)) {
        record(1, '40-character prefixed ids and seed-style ids are accepted', true);
      } else {
        record(1, '40-character prefixed ids and seed-style ids are accepted', false, new Error('Could not find inserted ids'));
      }
    } catch (err) {
      record(1, '40-character prefixed ids and seed-style ids are accepted', false, err);
    } finally {
      await conn.rollback();
    }

    // -------------------------------------------------------------------------
    // Case 2: duplicate username (case-different) and duplicate email -> duplicate error
    // -------------------------------------------------------------------------
    await conn.beginTransaction();
    try {
      await conn.query(
        `INSERT INTO users (id, full_name, username, email, password_hash)
         VALUES ('u_c2_1', 'Case Two', 'TestUser', 'case2@example.com', 'hash')`
      );

      let dupUsernameCaught = false;
      try {
        await conn.query(
          `INSERT INTO users (id, full_name, username, email, password_hash)
           VALUES ('u_c2_2', 'Case Two Dup', 'testuser', 'case2_other@example.com', 'hash')`
        );
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') dupUsernameCaught = true;
      }

      let dupEmailCaught = false;
      try {
        await conn.query(
          `INSERT INTO users (id, full_name, username, email, password_hash)
           VALUES ('u_c2_3', 'Case Two Dup Email', 'otheruser', 'case2@example.com', 'hash')`
        );
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') dupEmailCaught = true;
      }

      if (dupUsernameCaught && dupEmailCaught) {
        record(2, 'duplicate username (case-different) and duplicate email -> duplicate error', true);
      } else {
        record(2, 'duplicate username (case-different) and duplicate email -> duplicate error', false, 
          new Error(`dupUsernameCaught=${dupUsernameCaught}, dupEmailCaught=${dupEmailCaught}`));
      }
    } catch (err) {
      record(2, 'duplicate username (case-different) and duplicate email -> duplicate error', false, err);
    } finally {
      await conn.rollback();
    }

    // -------------------------------------------------------------------------
    // Case 3: username 'ab' -> CHECK violation
    // -------------------------------------------------------------------------
    await conn.beginTransaction();
    try {
      let checkViolated = false;
      try {
        await conn.query(
          `INSERT INTO users (id, full_name, username, email, password_hash)
           VALUES ('u_c3', 'Short User', 'ab', 'c3@example.com', 'hash')`
        );
      } catch (err) {
        if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') checkViolated = true;
      }

      if (checkViolated) {
        record(3, "username 'ab' -> CHECK violation", true);
      } else {
        record(3, "username 'ab' -> CHECK violation", false, new Error('CHECK constraint was not triggered for short username'));
      }
    } catch (err) {
      record(3, "username 'ab' -> CHECK violation", false, err);
    } finally {
      await conn.rollback();
    }

    // -------------------------------------------------------------------------
    // Case 4: project with an unknown owner -> foreign-key error
    // -------------------------------------------------------------------------
    await conn.beginTransaction();
    try {
      let fkCaught = false;
      try {
        await conn.query(
          `INSERT INTO projects (id, owner_id, name)
           VALUES ('p_c4', 'u_nonexistent', 'Orphan Project')`
        );
      } catch (err) {
        if (err.code === 'ER_NO_REFERENCED_ROW_2') fkCaught = true;
      }

      if (fkCaught) {
        record(4, 'project with an unknown owner -> foreign-key error', true);
      } else {
        record(4, 'project with an unknown owner -> foreign-key error', false, new Error('Foreign key error was not thrown'));
      }
    } catch (err) {
      record(4, 'project with an unknown owner -> foreign-key error', false, err);
    } finally {
      await conn.rollback();
    }

    // -------------------------------------------------------------------------
    // Case 5: duplicate (project,user) member -> error; accepted without joined_at -> CHECK
    // -------------------------------------------------------------------------
    await conn.beginTransaction();
    try {
      await conn.query(
        `INSERT INTO users (id, full_name, username, email, password_hash)
         VALUES ('u_c5_1', 'User C5 1', 'user_c5_1', 'c5_1@example.com', 'hash'),
                ('u_c5_2', 'User C5 2', 'user_c5_2', 'c5_2@example.com', 'hash')`
      );
      await conn.query(
        `INSERT INTO projects (id, owner_id, name) VALUES ('p_c5', 'u_c5_1', 'Project C5')`
      );
      await conn.query(
        `INSERT INTO project_members (id, project_id, user_id, role, status, joined_at)
         VALUES ('m_c5_1', 'p_c5', 'u_c5_1', 'owner', 'accepted', NOW())`
      );

      let dupMemberCaught = false;
      try {
        await conn.query(
          `INSERT INTO project_members (id, project_id, user_id, role, status, joined_at)
           VALUES ('m_c5_2', 'p_c5', 'u_c5_1', 'collaborator', 'accepted', NOW())`
        );
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') dupMemberCaught = true;
      }

      let checkJoinedCaught = false;
      try {
        await conn.query(
          `INSERT INTO project_members (id, project_id, user_id, role, status, joined_at)
           VALUES ('m_c5_3', 'p_c5', 'u_c5_2', 'collaborator', 'accepted', NULL)`
        );
      } catch (err) {
        if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') checkJoinedCaught = true;
      }

      if (dupMemberCaught && checkJoinedCaught) {
        record(5, 'duplicate (project,user) member -> error; accepted without joined_at -> CHECK', true);
      } else {
        record(5, 'duplicate (project,user) member -> error; accepted without joined_at -> CHECK', false,
          new Error(`dupMemberCaught=${dupMemberCaught}, checkJoinedCaught=${checkJoinedCaught}`));
      }
    } catch (err) {
      record(5, 'duplicate (project,user) member -> error; accepted without joined_at -> CHECK', false, err);
    } finally {
      await conn.rollback();
    }

    // -------------------------------------------------------------------------
    // Case 6: review pointing at another file's version -> foreign-key error
    // -------------------------------------------------------------------------
    await conn.beginTransaction();
    try {
      await conn.query(
        `INSERT INTO users (id, full_name, username, email, password_hash)
         VALUES ('u_c6', 'User C6', 'user_c6', 'c6@example.com', 'hash')`
      );
      await conn.query(`INSERT INTO projects (id, owner_id, name) VALUES ('p_c6', 'u_c6', 'Project C6')`);
      await conn.query(
        `INSERT INTO code_files (id, project_id, file_name, language, current_code, created_by)
         VALUES ('f_c6_1', 'p_c6', 'file1.c', 'C', 'int a;', 'u_c6'),
                ('f_c6_2', 'p_c6', 'file2.c', 'C', 'int b;', 'u_c6')`
      );
      await conn.query(
        `INSERT INTO code_versions (id, file_id, version_number, code, created_by)
         VALUES ('v_c6_1', 'f_c6_1', 1, 'int a;', 'u_c6'),
                ('v_c6_2', 'f_c6_2', 1, 'int b;', 'u_c6')`
      );

      let crossFileCaught = false;
      try {
        // file_id = f_c6_1, but version_id = v_c6_2 (which belongs to f_c6_2)
        await conn.query(
          `INSERT INTO reviews (id, file_id, version_id, reviewer_id, line_number, review_type, comment)
           VALUES ('r_c6', 'f_c6_1', 'v_c6_2', 'u_c6', 1, 'comment', 'Invalid cross-file review')`
        );
      } catch (err) {
        if (err.code === 'ER_NO_REFERENCED_ROW_2') crossFileCaught = true;
      }

      if (crossFileCaught) {
        record(6, "review pointing at another file's version -> foreign-key error", true);
      } else {
        record(6, "review pointing at another file's version -> foreign-key error", false, new Error('Cross-file version FK was not enforced'));
      }
    } catch (err) {
      record(6, "review pointing at another file's version -> foreign-key error", false, err);
    } finally {
      await conn.rollback();
    }

    // -------------------------------------------------------------------------
    // Case 7: lifecycle: open insert ok; ->resolved ok; ->closed ok; reopen (open, both
    //         timestamps null, reopen_count+1) ok; closed without closed_at -> CHECK;
    //         open with resolved_at -> CHECK
    // -------------------------------------------------------------------------
    await conn.beginTransaction();
    try {
      await conn.query(
        `INSERT INTO users (id, full_name, username, email, password_hash)
         VALUES ('u_c7', 'User C7', 'user_c7', 'c7@example.com', 'hash')`
      );
      await conn.query(`INSERT INTO projects (id, owner_id, name) VALUES ('p_c7', 'u_c7', 'Project C7')`);
      await conn.query(
        `INSERT INTO code_files (id, project_id, file_name, language, current_code, created_by)
         VALUES ('f_c7', 'p_c7', 'main.py', 'Python', 'print(1)', 'u_c7')`
      );
      await conn.query(
        `INSERT INTO code_versions (id, file_id, version_number, code, created_by)
         VALUES ('v_c7', 'f_c7', 1, 'print(1)', 'u_c7')`
      );

      // open insert ok
      await conn.query(
        `INSERT INTO reviews (id, file_id, version_id, reviewer_id, line_number, review_type, comment, status)
         VALUES ('r_c7', 'f_c7', 'v_c7', 'u_c7', 1, 'bug', 'Fix this bug', 'open')`
      );

      // -> resolved ok
      await conn.query(
        `UPDATE reviews SET status = 'resolved', resolved_by = 'u_c7', resolved_at = NOW() WHERE id = 'r_c7'`
      );

      // -> closed ok
      await conn.query(
        `UPDATE reviews SET status = 'closed', closed_by = 'u_c7', closed_at = NOW() WHERE id = 'r_c7'`
      );

      // -> reopen ok
      await conn.query(
        `UPDATE reviews 
         SET status = 'open', resolved_by = NULL, resolved_at = NULL, closed_by = NULL, closed_at = NULL,
             reopened_at = NOW(), reopen_count = reopen_count + 1 
         WHERE id = 'r_c7'`
      );

      let closedWithoutClosedAtCaught = false;
      try {
        await conn.query(
          `UPDATE reviews SET status = 'closed', closed_at = NULL WHERE id = 'r_c7'`
        );
      } catch (err) {
        if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') closedWithoutClosedAtCaught = true;
      }

      let openWithResolvedAtCaught = false;
      try {
        await conn.query(
          `UPDATE reviews SET status = 'open', resolved_at = NOW() WHERE id = 'r_c7'`
        );
      } catch (err) {
        if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') openWithResolvedAtCaught = true;
      }

      if (closedWithoutClosedAtCaught && openWithResolvedAtCaught) {
        record(7, 'lifecycle: open ok; ->resolved ok; ->closed ok; reopen ok; closed without closed_at -> CHECK; open with resolved_at -> CHECK', true);
      } else {
        record(7, 'lifecycle constraints check', false, 
          new Error(`closedWithoutClosedAt=${closedWithoutClosedAtCaught}, openWithResolvedAt=${openWithResolvedAtCaught}`));
      }
    } catch (err) {
      record(7, 'lifecycle constraints check', false, err);
    } finally {
      await conn.rollback();
    }

    // -------------------------------------------------------------------------
    // Case 8: deleting a review nulls tasks.review_id and keeps the task; deleting a file
    //         removes its versions and reviews; deleting a project removes files, versions,
    //         reviews, tasks, members, notifications, activity and messages
    // -------------------------------------------------------------------------
    await conn.beginTransaction();
    try {
      await conn.query(
        `INSERT INTO users (id, full_name, username, email, password_hash)
         VALUES ('u_c8', 'User C8', 'user_c8', 'c8@example.com', 'hash')`
      );
      await conn.query(`INSERT INTO projects (id, owner_id, name) VALUES ('p_c8', 'u_c8', 'Project C8')`);
      await conn.query(
        `INSERT INTO project_members (id, project_id, user_id, role, status, joined_at)
         VALUES ('m_c8', 'p_c8', 'u_c8', 'owner', 'accepted', NOW())`
      );
      await conn.query(
        `INSERT INTO code_files (id, project_id, file_name, language, current_code, created_by)
         VALUES ('f_c8', 'p_c8', 'test.py', 'Python', 'code', 'u_c8')`
      );
      await conn.query(
        `INSERT INTO code_versions (id, file_id, version_number, code, created_by)
         VALUES ('v_c8', 'f_c8', 1, 'code', 'u_c8')`
      );
      await conn.query(
        `INSERT INTO reviews (id, file_id, version_id, reviewer_id, line_number, review_type, comment)
         VALUES ('r_c8', 'f_c8', 'v_c8', 'u_c8', 1, 'comment', 'review note')`
      );
      await conn.query(
        `INSERT INTO tasks (id, project_id, review_id, created_by, title)
         VALUES ('t_c8', 'p_c8', 'r_c8', 'u_c8', 'Task C8')`
      );
      await conn.query(
        `INSERT INTO notifications (id, user_id, project_id, type, message)
         VALUES ('n_c8', 'u_c8', 'p_c8', 'task', 'notification test')`
      );
      await conn.query(
        `INSERT INTO activity_log (id, project_id, user_id, action_text)
         VALUES ('a_c8', 'p_c8', 'u_c8', 'activity test')`
      );
      await conn.query(
        `INSERT INTO messages (id, project_id, sender_id, content)
         VALUES ('msg_c8', 'p_c8', 'u_c8', 'hello team')`
      );

      // Delete review -> task survives with review_id = NULL
      await conn.query(`DELETE FROM reviews WHERE id = 'r_c8'`);
      const [taskRows] = await conn.query(`SELECT id, review_id FROM tasks WHERE id = 't_c8'`);
      const taskSurvived = taskRows.length === 1 && taskRows[0].review_id === null;

      // Recreate review to test file delete
      await conn.query(
        `INSERT INTO reviews (id, file_id, version_id, reviewer_id, line_number, review_type, comment)
         VALUES ('r_c8_2', 'f_c8', 'v_c8', 'u_c8', 1, 'comment', 'review note 2')`
      );
      await conn.query(`DELETE FROM code_files WHERE id = 'f_c8'`);
      const [vRows] = await conn.query(`SELECT id FROM code_versions WHERE id = 'v_c8'`);
      const [rRows] = await conn.query(`SELECT id FROM reviews WHERE id = 'r_c8_2'`);
      const fileCascaded = vRows.length === 0 && rRows.length === 0;

      // Delete project -> removes everything under it
      await conn.query(`DELETE FROM projects WHERE id = 'p_c8'`);
      const [pRows] = await conn.query(`SELECT id FROM projects WHERE id = 'p_c8'`);
      const [mRows] = await conn.query(`SELECT id FROM project_members WHERE project_id = 'p_c8'`);
      const [tRows] = await conn.query(`SELECT id FROM tasks WHERE project_id = 'p_c8'`);
      const [nRows] = await conn.query(`SELECT id FROM notifications WHERE project_id = 'p_c8'`);
      const [aRows] = await conn.query(`SELECT id FROM activity_log WHERE project_id = 'p_c8'`);
      const [msgRows] = await conn.query(`SELECT id FROM messages WHERE project_id = 'p_c8'`);

      const projectCascaded = pRows.length === 0 && mRows.length === 0 && tRows.length === 0 &&
                              nRows.length === 0 && aRows.length === 0 && msgRows.length === 0;

      if (taskSurvived && fileCascaded && projectCascaded) {
        record(8, 'deleting review nulls tasks.review_id; deleting file cascades; deleting project cascades all', true);
      } else {
        record(8, 'cascades validation', false, 
          new Error(`taskSurvived=${taskSurvived}, fileCascaded=${fileCascaded}, projectCascaded=${projectCascaded}`));
      }
    } catch (err) {
      record(8, 'cascades validation', false, err);
    } finally {
      await conn.rollback();
    }

    // -------------------------------------------------------------------------
    // Case 9: due_date comes back as the string '2026-10-05'
    // -------------------------------------------------------------------------
    await conn.beginTransaction();
    try {
      await conn.query(
        `INSERT INTO users (id, full_name, username, email, password_hash)
         VALUES ('u_c9', 'User C9', 'user_c9', 'c9@example.com', 'hash')`
      );
      await conn.query(`INSERT INTO projects (id, owner_id, name) VALUES ('p_c9', 'u_c9', 'Project C9')`);
      await conn.query(
        `INSERT INTO tasks (id, project_id, created_by, title, due_date)
         VALUES ('t_c9', 'p_c9', 'u_c9', 'Due Date Test Task', '2026-10-05')`
      );

      const [rows] = await conn.query(`SELECT due_date FROM tasks WHERE id = 't_c9'`);
      const dueDateVal = rows[0]?.due_date;
      const isString = typeof dueDateVal === 'string';
      const exactMatch = dueDateVal === '2026-10-05';

      if (isString && exactMatch) {
        record(9, "due_date comes back as the string '2026-10-05'", true);
      } else {
        record(9, "due_date comes back as the string '2026-10-05'", false,
          new Error(`Received: ${typeof dueDateVal} with value: "${dueDateVal}"`));
      }
    } catch (err) {
      record(9, "due_date comes back as the string '2026-10-05'", false, err);
    } finally {
      await conn.rollback();
    }

  } finally {
    await conn.end();
  }

  // Print PASS / FAIL summary table
  console.log('\n================================================================================');
  console.log('PART D4: SCHEMA VERIFICATION SUITE RESULTS');
  console.log('================================================================================');
  let passCount = 0;
  let failCount = 0;
  for (const r of results) {
    const status = r.passed ? 'PASS' : 'FAIL';
    if (r.passed) passCount++; else failCount++;
    console.log(`[${status}] Case ${r.id}: ${r.description}${r.error ? ' -> ' + r.error : ''}`);
  }
  console.log('--------------------------------------------------------------------------------');
  console.log(`Total: ${results.length} | Passed: ${passCount} | Failed: ${failCount}`);
  console.log('================================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runVerify().catch(err => {
    console.error('Fatal verification error:', err);
    process.exit(1);
  });
}

module.exports = runVerify;
