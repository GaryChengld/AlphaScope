# System Context: AlphaScope

## Project Overview

AlphaScope is an automated investment analysis system designed to fetch financial data, process it through advanced AI models, and provide actionable stock market insights.

## System Architecture

The system follows a Monorepo structure and is built on top of Firebase (Google Cloud).

### 1. External Systems & APIs

- **Yahoo Finance API**: Used via `yahoo-finance2` (Node.js) to fetch real-time and historical market data (OHLCV, Financials, Statistics).
- **Gemini API (Google AI)**: The core reasoning engine used for analyzing processed financial data and generating reports.
- **Firebase Functions**: The backend environment hosting the logic and API endpoints.

### 2. Core Components

- **Data Fetcher**: Service to retrieve raw data from financial providers.
- **AI Analyst**: Service that formats raw data into prompts and interacts with the Gemini API (Logic previously referred to as v18.7).
- **Report Generator**: Service that formats AI outputs into structured documents or API responses.

## Technical Stack

- **Runtime**: Node.js (Latest LTS)
- **Deployment**: Firebase Functions (v2)
- **Module System**: ESM (ECMAScript Modules, `type: module`)
- **Primary Language**: JavaScript (All code and comments must be in English)

## Project Directory Structure

```text
AlphaScope/
├── specs/                  # Documentation and system design
│   └── system-context.md   # This file
├── functions/              # Firebase backend
│   ├── index.js            # Entry point
│   ├── src/
│   │   ├── services/       # Business logic (Yahoo Finance, AI Analysis)
│   │   ├── prompts/        # AI Prompt templates (e.g., v18.7 logic)
│   │   └── utils/          # Helper functions
│   └── package.json
└── .gitignore              # Environment safety
```

## Security & Standards

- **Environment Secrets**: All API keys must be stored in `.env` (local) or Firebase Secrets Manager (production).
- **Language**: Strictly **English** for all source code, variable names, and documentation within the code.
- **Git Flow**: All changes should be committed with clear, descriptive English messages.
