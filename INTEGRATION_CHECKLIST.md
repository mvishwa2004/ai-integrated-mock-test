# MySQL Integration Checklist

- [ ] Set `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, and
      `MYSQL_PASSWORD` in the root `.env.local`.
- [ ] Run `mysql_schema.sql` in MySQL Workbench or the provider's SQL editor.
- [ ] Restart the Next.js dev server after changing environment variables.
- [ ] Sign up with a new email and a password of at least 8 characters.
- [ ] Finish a mock exam.
- [ ] Open the dashboard History page and confirm the exam appears.
- [ ] In MySQL, query `users`, `exams`, and `exam_topic_scores` to confirm rows
      were saved.
- [ ] Confirm topic accuracy is calculated from the saved topic scores.

For setup details and sample queries, see `MYSQL_SETUP.md`.
