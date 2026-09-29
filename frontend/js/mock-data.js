const SeedData = {
  users: [
    { id: 'u1', full_name: 'Prasanna Chaudhari', username: 'prasanna', email: 'prasanna@example.com', created_at: '2026-09-01T10:00:00Z', password: 'password' },
    { id: 'u2', full_name: 'Himesh Sawant', username: 'himesh', email: 'himesh@example.com', created_at: '2026-09-02T10:00:00Z', password: 'password' },
    { id: 'u3', full_name: 'Divyesh Patil', username: 'divyesh', email: 'divyesh@example.com', created_at: '2026-09-03T10:00:00Z', password: 'password' },
    { id: 'u4', full_name: 'Mayuresh Kale', username: 'mayuresh', email: 'mayuresh@example.com', created_at: '2026-09-04T10:00:00Z', password: 'password' },
    { id: 'u5', full_name: 'Sneha Joshi', username: 'sneha', email: 'sneha@example.com', created_at: '2026-09-05T10:00:00Z', password: 'password' },
    { id: 'u6', full_name: 'Rohan Mehta', username: 'rohan', email: 'rohan@example.com', created_at: '2026-09-06T10:00:00Z', password: 'password' }
  ],
  projects: [
    { id: 'p1', name: 'Student Management System', description: 'A Java based student management system.', owner_id: 'u1', visibility: 'public', category: 'Java', created_at: '2026-09-10T10:00:00Z', updated_at: '2026-09-25T10:00:00Z' },
    { id: 'p2', name: 'Banking Application', description: 'C based banking application for secure transactions.', owner_id: 'u2', visibility: 'private', category: 'C', created_at: '2026-09-12T10:00:00Z', updated_at: '2026-09-26T10:00:00Z' },
    { id: 'p3', name: 'Library Management', description: 'Python script to manage books.', owner_id: 'u3', visibility: 'public', category: 'Python', created_at: '2026-09-15T10:00:00Z', updated_at: '2026-09-27T10:00:00Z' },
    { id: 'p4', name: 'Portfolio Analyzer', description: 'Analyze stock portfolios.', owner_id: 'u5', visibility: 'private', category: 'Python', created_at: '2026-09-18T10:00:00Z', updated_at: '2026-09-28T10:00:00Z' }
  ],
  project_members: [
    { id: 'm1', project_id: 'p1', user_id: 'u2', role: 'collaborator', status: 'accepted', invited_by: 'u1', joined_at: '2026-09-11T10:00:00Z' },
    { id: 'm2', project_id: 'p1', user_id: 'u4', role: 'collaborator', status: 'pending', invited_by: 'u1', joined_at: null },
    { id: 'm3', project_id: 'p2', user_id: 'u1', role: 'collaborator', status: 'accepted', invited_by: 'u2', joined_at: '2026-09-13T10:00:00Z' }
  ],
  code_files: [
    { id: 'f1', project_id: 'p1', file_name: 'Main.java', language: 'Java', current_code: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello Student System");\n        // unused variable issue here\n        int x = 10;\n    }\n}\n', created_by: 'u1', created_at: '2026-09-10T10:30:00Z', updated_at: '2026-09-25T10:00:00Z' },
    { id: 'f2', project_id: 'p1', file_name: 'Student.java', language: 'Java', current_code: 'public class Student {\n    private String name;\n    private int age;\n    \n    public Student(String name, int age) {\n        this.name = name;\n        this.age = age;\n    }\n}\n', created_by: 'u1', created_at: '2026-09-11T10:30:00Z', updated_at: '2026-09-11T10:30:00Z' },
    { id: 'f3', project_id: 'p1', file_name: 'StudentManager.java', language: 'Java', current_code: 'import java.util.ArrayList;\n\npublic class StudentManager {\n    private ArrayList<Student> list = new ArrayList<>();\n    \n    public void addStudent(Student s) {\n        list.add(s);\n    }\n}\n', created_by: 'u2', created_at: '2026-09-12T10:30:00Z', updated_at: '2026-09-12T10:30:00Z' },
    { id: 'f4', project_id: 'p2', file_name: 'main.c', language: 'C', current_code: '#include <stdio.h>\n#include "account.h"\n\nint main() {\n    printf("Banking App Started\\n");\n    int balance = get_balance();\n    printf("Balance: %d\\n", balance);\n    return 0;\n}\n', created_by: 'u2', created_at: '2026-09-12T11:00:00Z', updated_at: '2026-09-13T10:00:00Z' },
    { id: 'f5', project_id: 'p2', file_name: 'account.c', language: 'C', current_code: '#include "account.h"\n\nint get_balance() {\n    // bug: returning hardcoded value\n    return 1000;\n}\n', created_by: 'u1', created_at: '2026-09-13T10:30:00Z', updated_at: '2026-09-13T10:30:00Z' },
    { id: 'f6', project_id: 'p2', file_name: 'account.h', language: 'C', current_code: '#ifndef ACCOUNT_H\n#define ACCOUNT_H\n\nint get_balance();\n\n#endif\n', created_by: 'u2', created_at: '2026-09-12T11:05:00Z', updated_at: '2026-09-12T11:05:00Z' },
    { id: 'f7', project_id: 'p3', file_name: 'library.py', language: 'Python', current_code: 'books = []\n\ndef add_book(title):\n    books.append(title)\n\ndef get_books():\n    return books\n', created_by: 'u3', created_at: '2026-09-15T10:30:00Z', updated_at: '2026-09-15T10:30:00Z' },
    { id: 'f8', project_id: 'p3', file_name: 'utils.py', language: 'Python', current_code: 'def format_title(title):\n    return title.title()\n', created_by: 'u3', created_at: '2026-09-16T10:30:00Z', updated_at: '2026-09-16T10:30:00Z' }
  ],
  code_versions: [
    { id: 'v1', file_id: 'f1', version_number: 1, code: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello");\n    }\n}\n', created_by: 'u1', created_at: '2026-09-10T10:30:00Z' },
    { id: 'v2', file_id: 'f1', version_number: 2, code: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello Student System");\n        // unused variable issue here\n        int x = 10;\n    }\n}\n', created_by: 'u1', created_at: '2026-09-25T10:00:00Z' },
    { id: 'v3', file_id: 'f4', version_number: 1, code: '#include <stdio.h>\n\nint main() {\n    printf("Banking App Started\\n");\n    return 0;\n}\n', created_by: 'u2', created_at: '2026-09-12T11:00:00Z' },
    { id: 'v4', file_id: 'f4', version_number: 2, code: '#include <stdio.h>\n#include "account.h"\n\nint main() {\n    printf("Banking App Started\\n");\n    int balance = get_balance();\n    printf("Balance: %d\\n", balance);\n    return 0;\n}\n', created_by: 'u2', created_at: '2026-09-13T10:00:00Z' }
  ],
  reviews: [
    { id: 'r1', file_id: 'f1', version_id: 'v2', reviewer_id: 'u2', line_number: 5, review_type: 'bug', comment: 'Variable x is never used.', status: 'open', resolved_by: null, resolved_at: null, closed_by: null, closed_at: null, created_at: '2026-09-26T10:00:00Z', updated_at: '2026-09-26T10:00:00Z' },
    { id: 'r2', file_id: 'f1', version_id: 'v1', reviewer_id: 'u2', line_number: 3, review_type: 'suggestion', comment: 'Make the output more descriptive.', status: 'closed', resolved_by: 'u1', resolved_at: '2026-09-15T10:00:00Z', closed_by: 'u1', closed_at: '2026-09-16T10:00:00Z', created_at: '2026-09-11T10:00:00Z', updated_at: '2026-09-16T10:00:00Z' },
    { id: 'r3', file_id: 'f5', version_id: null, reviewer_id: 'u2', line_number: 4, review_type: 'bug', comment: 'Hardcoded balance is not secure.', status: 'open', resolved_by: null, resolved_at: null, closed_by: null, closed_at: null, created_at: '2026-09-14T10:00:00Z', updated_at: '2026-09-14T10:00:00Z' }
  ],
  tasks: [
    { id: 't1', project_id: 'p1', review_id: 'r1', created_by: 'u1', assigned_to: 'u2', title: 'Fix unused variable in Main.java', description: 'Variable x is never used.', status: 'todo', priority: 'medium', due_date: '2026-10-05T00:00:00Z', created_at: '2026-09-26T11:00:00Z', updated_at: '2026-09-26T11:00:00Z' },
    { id: 't2', project_id: 'p2', review_id: 'r3', created_by: 'u2', assigned_to: 'u1', title: 'Connect get_balance to database', description: 'Hardcoded balance is not secure.', status: 'in_progress', priority: 'high', due_date: '2026-09-30T00:00:00Z', created_at: '2026-09-14T11:00:00Z', updated_at: '2026-09-15T10:00:00Z' }
  ],
  notifications: [
    { id: 'n1', user_id: 'u1', type: 'invitation', message: 'You have been invited to collaborate on Banking Application.', reference_id: 'm3', project_id: 'p2', is_read: true, created_at: '2026-09-12T10:00:00Z' },
    { id: 'n2', user_id: 'u4', type: 'invitation', message: 'You have been invited to collaborate on Student Management System.', reference_id: 'm2', project_id: 'p1', is_read: false, created_at: '2026-09-28T08:00:00Z' },
    { id: 'n3', user_id: 'u1', type: 'review', message: 'Himesh Sawant added a bug review on Main.java', reference_id: 'r1', project_id: 'p1', is_read: false, created_at: '2026-09-26T10:05:00Z' }
  ],
  activity: [
    { id: 'a1', project_id: 'p1', user_id: 'u1', action_text: 'created the project.', created_at: '2026-09-10T10:00:00Z' },
    { id: 'a2', project_id: 'p1', user_id: 'u2', action_text: 'added a Bug review to Main.java line 5.', created_at: '2026-09-26T10:00:00Z' }
  ]
};
window.SeedData = SeedData;
