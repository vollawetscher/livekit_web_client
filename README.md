# Unified Calling App

A modern web application combining video calling (WebRTC) and phone calling (PSTN) in one unified interface.

## Features

- **Video Calls** - Make WebRTC video calls to other web users
- **Phone Calls** - Make PSTN calls to any phone number
- **Contact Management** - Save and organize both web and phone contacts
- **Call History** - Track all your calls in one place
- **Push Notifications** - Get notified of incoming calls

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables in `.env`:
```
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_LIVEKIT_URL=your-livekit-url
```

3. Run the development server:
```bash
npm run dev
```

## Usage

1. Sign up or log in with email/password
2. Enable notifications to receive incoming calls
3. Click "Enable PSTN" to make phone calls
4. Switch between web and phone contacts using the tabs
5. Click a contact to start a call

## Tech Stack

- React + TypeScript + Vite
- Supabase (Database & Auth)
- LiveKit (Real-time communication)
- Tailwind CSS
