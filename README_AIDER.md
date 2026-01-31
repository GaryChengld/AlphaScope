# Aider Installation & Setup Guide for AlphaScope

This guide documents the specific steps taken to successfully install and configure Aider on a Windows environment using Python 3.13.

## 📋 System Environment

- **OS**: Windows 10/11
- **Python**: 3.13.x (with fallback to 3.12 via uv)
- **Git**: 2.21+
- **Project Structure**: Monorepo

## 🛠 Installation Process

### 1. Update Core Build Tools

Since Python 3.13 is new, core build tools must be updated to handle dependency compilation:

```powershell
python.exe -m pip install --upgrade pip setuptools wheel
```

### 2. Install Aider via UV (Recommended)

To avoid compatibility issues with `tiktoken` and `numpy` on Python 3.13, we use `uv` to manage a compatible Python 3.12 environment:

```powershell
# Install the aider installer
python -m pip install aider-install

# Execute the installer to set up the environment
python -m aider_install
```

### 3. Resolve Missing Rust/C++ Compiler Issues

If you encounter `ModuleNotFoundError: No module named 'setuptools_rust'`, use `uv` to install Aider in an isolated tool container:

```powershell
python -m uv tool install --python 3.12 aider-chat
```

---

## 🔑 Environment Configuration

### API Key Setup

Create a `.env` file in the root directory (`/AlphaScope/.env`):

```text
GEMINI_API_KEY=your_actual_api_key_here
```

_Note: The `.gitignore` is already configured to exclude `.env` for security._

---

## 🚀 Usage

### Starting Aider

Always run Aider from the project root. Using `uvx` ensures the correct environment is used:

```powershell
uvx aider --model gemini/gemini-1.5-pro
```

### Common Commands

- `/ls`: List all files in the current context.
- `/add <file>`: Add a specific file to the chat session.
- `/undo`: Revert the last change made by the AI.
- `/exit`: Close the session.
