# Firebase Studio

This is a NextJS starter in Firebase Studio with AI‑powered mock exam generation
using Genkit and Google's Gemini models.

## Setup

1. **Environment variables** – create a `.env` file at the project root with at least:

   ```
   GOOGLE_API_KEY=your_google_genai_api_key_here
   MYSQL_HOST=localhost
   MYSQL_PORT=3306
   MYSQL_DATABASE=mocktest
   MYSQL_USER=your_mysql_username
   MYSQL_PASSWORD=your_mysql_password
   ```

   `MYSQL_*` settings are required for MySQL-backed signup, login, exam history,
   and topic analytics. Keep them server-only; do not prefix them with
   `NEXT_PUBLIC_` or commit real credentials.

   Create the MySQL tables by running [`mysql_schema.sql`](./mysql_schema.sql).
   See [`MYSQL_SETUP.md`](./MYSQL_SETUP.md) for setup and verification queries.

   The application will throw an error on startup if the Google API key is missing.

   Additionally, the server must be able to reach Google's GenAI endpoint:
   `https://generativelanguage.googleapis.com`. If you are behind a
   firewall/proxy or have no internet connectivity, exam generation will fail
   with network errors.

2. Install dependencies and start the development server:
   ```bash
   npm install
   npm run dev
   ```

3. Build for production:
   ```bash
   npm run build
   ```

4. The AI flows are defined under `src/ai/flows` and are invoked from client
   components. See `src/ai/genkit.ts` if you need to change the model.

For more details, inspect the files under `src/ai` and the app pages.
