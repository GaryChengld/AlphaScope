# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Alpha Scope** is a client/server application for maintaining stock watchlists and showing stock details. It follows a code-generation approach: trading strategies are described in plain English, and Claude Code generates the corresponding JavaScript scanning functions. At runtime, the scanner uses pure logic — no AI is involved unless explicitly requested.

## Tech Stack

- **Runtime:** Node.js v20+ with TypeScript
- **Frontend:** React 18 + Vite + Tailwind CSS + Lucide Icons + socket.io-client + react-markdown
- **Backend:** Express.js + Socket.io (real-time streaming)
- **Database:** SQLite via Prisma ORM
- **AI:** Multi-provider LLM support — Google Gemini, OpenAI, Claude (persistent chat session, lazy-initialized)
- **Market Data:** `yahoo-finance2` (on-demand 5-min OHLC + daily candles for SPX, SPY, and 11 sector ETFs)
- **Indicators:** `technicalindicators` library (VWAP, SMA, RSI, ATR)
- **Charts:** `lightweight-charts` v5 (SPX candlestick chart with VWAP, volume, RSI pane)

## Repository Structure

```
server/     # Express + Socket.io backend (Node.js + TypeScript)
client/     # React + Vite frontend (TypeScript)
specs/      # Architecture docs and task tracking
  tasks/    # Plan files (NN-short-kebab-case-description.md)
```

Server and client are independently runnable while manageable from the workspace root.

## Working Conventions

- **Plan first:** Always create a plan before starting implementation work.
- **Plan files:** Use the filename pattern `NN-short-kebab-case-description.md` (e.g., `01-initialize-project-structure.md`) under `specs/tasks/`.
- **Scope changes:** If implementation scope changes, update the corresponding plan file before continuing.
- **Code generation is opt-in:** Do not generate implementation code, scaffolding, or starter files unless explicitly asked.
- **Stack alignment:** Keep recommendations aligned with the tech stack above unless asked to change it.

## Environment & Secrets

Store API keys in `.env` (gitignored). Required keys: `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`.
