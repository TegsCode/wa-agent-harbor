# Wa Agent Harbor

Build "WhatsApp Agent Hub": a centralized dashboard and AI Agent Gateway (MCP + REST) for managing multiple WhatsApp numbers, scanning QR codes to connect, and letting external AI agents (like Claude Desktop, Cursor, or remote chatbots) read/send messages, manage contacts, and inspect groups under granular permissions.

### 1. Architecture & Local Bridge Concept
Web browsers cannot keep persistent WhatsApp WebSocket sessions alive indefinitely on their own. Therefore, the app supports:
- **"Set Up This Computer" Onboarding:** A dedicated modal and setup tab with copy-paste one-line commands (macOS/Linux terminal, Windows PowerShell, and Docker Compose) that run a lightweight WhatsApp bridge (WAHA or Evolution API) and an optional Cloudflare Tunnel (`cloudflared`). The tunnel gives the user's computer a public HTTPS URL so external AI agents and the web dashboard can communicate with the bridge from anywhere.
- **Mock/Demo Fallback:** If no bridge is connected, the app operates seamlessly in Demo Mode with realistic mock WhatsApp accounts, active conversations, contacts, and simulated QR pairing so the entire UI and agent flow can be explored immediately.
- **Bridge Settings:** In settings, admins can configure `bridge_url` (local or Cloudflare Tunnel) and `bridge_api_key`, with a "Test Connection" button checking live bridge health.

### 2. Database Schema & Security (Supabase / Lovable Cloud)
Enable Row Level Security (RLS) on all tables:
1. `app_role` enum: `'admin'`, `'member'`.
2. `user_roles`: `id`, `user_id` (references `auth.users`), `role`, `email`, `created_at`.
   - Security rule: The first user to register becomes `admin`. Subsequent users can only join if their email exists in `team_invites`.
3. `team_invites`: `email` (primary key), `invited_by`, `created_at`. Only admins can add or delete invites.
4. `bridge_settings`: single row (`id = 1`), `bridge_url`, `bridge_api_key`, `updated_at`. Admins can edit; members can read.
5. `wa_accounts`: `id` (uuid), `instance_name` (unique string), `label` (text, e.g. "Sales Support +1..."), `created_by`, `status` ('connected' | 'pairing' | 'disconnected'), `phone_number`, `profile_picture_url`, `created_at`.
6. `contacts`: `id`, `account_id` (references `wa_accounts`), `phone`, `name`, `notes`, `tags` (text array), `created_at`. Unique on `(account_id, phone)`.
7. `agent_keys`: `id`, `name`, `key_prefix`, `key_hash`, `actions` (text array of permitted capabilities: `'read'`, `'send'`, `'contacts'`, `'groups'`), `account_ids` (uuid array: restricted to specific accounts or empty for all), `allowed_chats` (text array: optional allowlist of phone numbers/JIDs), `created_by`, `last_used_at`, `revoked_at`, `created_at`.
8. `agent_requests`: `id`, `key_id` (references `agent_keys`), `tool` (e.g. `send_message`), `ok` (boolean), `error` (text), `created_at`.

### 3. Core Features & User Interface

#### A. Authentication & Team Management
- Clean sign-up/login page with Email/Password and Google options.
- Team settings view: List team members, display roles, and an "Invite Member" dialog allowing admins to whitelist coworker emails.

#### B. WhatsApp Accounts & QR Pairing
- Multi-account dashboard displaying all connected WhatsApp profiles, phone numbers, and live status badges.
- "+ Connect Account" action:
  - Generates a new instance/session on the configured bridge (or simulated in mock mode).
  - Renders the live QR code directly on screen for the user to scan via WhatsApp mobile (Linked Devices).
  - Automatically polls status until paired, then displays profile details and success toast.
  - Actions per account: View QR, Reconnect, Refresh status, Delete/Disconnect.

#### C. In-App Chat & Group Inspector
- Split-pane interface:
  - **Left pane:** Searchable list of conversations (private chats and group chats) with avatar, contact name/phone, last message snippet, timestamp, and unread badges.
  - **Center pane:** Full chat history thread with incoming/outgoing bubbles, delivery status indicators, and an interactive message composer to send test messages directly.
  - **Right pane / Drawer:** Contact or Group metadata inspector showing participant lists, admin status, and contact notes.

#### D. Contacts Manager
- Address book view filtered by WhatsApp account.
- Table and card views of contacts with name, phone number, custom tags, and notes.
- Ability to manually add contacts, edit details, or import contacts from the connected WhatsApp account.

#### E. AI Agent Gateway, MCP & API Keys
- **API Key Generator:**
  - Create agent access keys with granular checkboxes:
    - Target Accounts: All accounts or specific select accounts.
    - Permissions: `read` (read chats and history), `send` (send text messages), `contacts` (list and create contacts), `groups` (list and inspect groups).
    - Chat Restrictions: Optional comma-separated list of allowed phone numbers or group IDs.
  - Reveal full `wa_live_...` key once with a copy button.
- **Copy-Paste Agent Configs:**
  - Pre-formatted `claude_desktop_config.json` snippet configured to run the MCP server.
  - Cursor / AI Agent configuration tabs and raw REST curl documentation.
- **MCP Server & Gateway Implementation:**
  - Expose an MCP-compatible endpoint / Edge Function supporting tools:
    - `list_accounts`: Returns available WhatsApp accounts.
    - `get_chats`: Returns recent conversation threads.
    - `get_messages`: Fetches chat history with a specified contact/group.
    - `send_message`: Sends a message to a recipient phone or group JID (enforcing `'send'` permission).
    - `list_contacts` and `create_contact`: Manage the address book (enforcing `'contacts'` permission).
    - `list_groups` and `get_group_info`: Inspect groups (enforcing `'groups'` permission).
  - Validates API key, checks action permissions, rejects unauthorized requests, and logs each call to `agent_requests`.
- **Agent Request Logs:**
  - Real-time audit table showing recent agent calls: Timestamp, Key Name, Tool Name, Success/Failure badge, and error message if rejected.

#### F. Computer Setup Helper ("Set Up This Computer")
- Modal providing step-by-step instructions:
  1. Docker or Terminal command:
     `curl -fsSL https://... | bash` (or Docker Compose template) running WAHA / Evolution API + Cloudflare Tunnel.
  2. Copies the generated tunnel URL into the Bridge Settings.
  3. Displays connection health indicator (green when responding).

### 4. Design & Polish
- Built with Tailwind CSS, React, and Lucide icons.
- Modern dashboard theme with sidebar navigation (Accounts, Chats, Contacts, Agent Keys, Audit Logs, Settings).
- Toast feedback for copying keys, sending messages, and pairing accounts.
- Empty states with clear call-to-actions when no accounts or keys are created yet.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/0d698446-a959-4db8-aa61-41207b37be6e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
