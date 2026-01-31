# Firebase CLI & Environment Setup Guide

This guide outlines the steps to install the Firebase CLI, Python, and Aider to initialize your local development environment for the **Stock AI Analysis** project.

---

## 1. Prerequisites

Before starting, ensure you have the following installed on your machine:

### Core Runtimes

- **Node.js**: Version 18 or 20 (LTS recommended) - [Download](https://nodejs.org/).
- **Python**: Version 3.10 or higher (Required for Aider) - [Download](https://www.python.org/).

### Check your versions:

```bash
node -v
npm -v
python --version  # or python3 --version
```

---

## 2. Install Firebase CLI

Install the Firebase command-line tools globally using npm:

```bash
npm install -g firebase-tools
```

> **Note:** On macOS or Linux, you might need to use `sudo npm install -g firebase-tools`.

---

## 3. Install Aider (Your AI Coding Agent)

Aider is the CLI tool that will act as your AI pair programmer.

```bash
# Recommendation: Use pip to install
pip install aider-chat

# Or use the official one-liner installer
python -m pip install aider-install
aider-install
```

---

## 4. Authentication & API Setup

### Firebase Login

```bash
firebase login
```

### Gemini API Key (For Aider)

Aider needs a Gemini API Key to "think".

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Create an API Key (in a new or existing project).
3. **Set the environment variable** (Important: You must do this in every new terminal session, or add it to your profile):

**macOS / Linux:**

```bash
export GEMINI_API_KEY=your_key_here
```

**Windows (PowerShell):**

```powershell
$env:GEMINI_API_KEY = "your_key_here"
```

---

## 5. Project Initialization

Navigate to the project root and link it to your Firebase project:

```bash
# Link to an existing project or create a new one
firebase use --add

# If starting fresh
firebase init
```

---

## 6. Local Emulator Suite (Crucial for Vibe Coding)

To run your project locally without incurring costs:

1. **Install Java**: The Firebase Emulator Suite requires Java 11 or higher (JRE).
2. **Start Emulators**:
   ```bash
   firebase emulators:start
   ```
3. **Access Emulator UI**: Open `http://localhost:4000`.

---

## 7. Start Vibe Coding with Aider

Once everything is set up, launch Aider in your project root to start building:

```bash
# Launch Aider using Gemini 1.5 Pro
aider --model gemini/gemini-1.5-pro
```

### Common Aider Commands

- `/add <file>`: Add a file to the AI's context.
- `/ask <question>`: Ask a question without changing code.
- `/undo`: Undo the last change made by the AI.

---

## 8. Command Reference

| Tool         | Command                    | Description                |
| :----------- | :------------------------- | :------------------------- |
| **Firebase** | `firebase deploy`          | Deploy to production.      |
| **Firebase** | `firebase emulators:start` | Run locally.               |
| **Aider**    | `aider --model gemini/...` | Start AI pair programming. |

---

### 💡 Next Step

Now that your environment is ready, move your **`specs/system-context.md`** into the project. Then, open Aider and tell it: _"Read the specs and scaffold the functions directory."_
