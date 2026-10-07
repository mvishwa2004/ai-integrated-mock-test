# MySQL Setup

The application uses MySQL for account signup/login, exam attempts, exam dates,
and topic scores. It does not use Supabase for these flows.

## Configure the connection

Set these server-only variables in the root `.env.local` file:

```env
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DATABASE=mocktest
MYSQL_USER=your_mysql_username
MYSQL_PASSWORD=your_mysql_password
```

Do not add the `NEXT_PUBLIC_` prefix or commit real credentials.

## Create the tables

Open `mysql_schema.sql` in MySQL Workbench or your MySQL provider's SQL editor
and run it. It creates the `users`, `user_sessions`, `exams`, and
`exam_topic_scores` tables.

## Verify saved exam data

```sql
USE mocktest;

SELECT u.name, u.email, e.category, e.completed_at, e.score,
       e.correct_count, e.total_questions
FROM users AS u
JOIN exams AS e ON e.user_id = u.id
ORDER BY e.completed_at DESC;
```

Check topic-level scores and weakest topics:

```sql
SELECT ts.topic,
       ROUND(SUM(ts.correct_count) * 100.0 /
             NULLIF(SUM(ts.total_questions), 0), 2) AS accuracy_percent
FROM exam_topic_scores AS ts
JOIN exams AS e ON e.id = ts.exam_id
WHERE e.user_id = 1
GROUP BY ts.topic
HAVING SUM(ts.total_questions) > 0
ORDER BY accuracy_percent ASC
LIMIT 3;
```

Replace `1` with the matching `users.id`. The application uses a parameterized
query and derives that ID from the authenticated session.
