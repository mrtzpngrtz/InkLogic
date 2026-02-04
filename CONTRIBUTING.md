# Contributing to InkLogic Android

Thank you for your interest in contributing to InkLogic Android!

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR-USERNAME/InkLogic.git`
3. Navigate to the project: `cd InkLogic`
4. Install dependencies: `cd android_app && npm install`

## Development Workflow

1. Create a new branch: `git checkout -b feature/your-feature-name`
2. Make your changes in the `android_app/` directory
3. Test your changes:
   ```bash
   cd android_app
   npm run build
   npx cap sync android
   npx cap open android
   ```
4. Commit your changes: `git commit -am 'Add some feature'`
5. Push to your fork: `git push origin feature/your-feature-name`
6. Create a Pull Request

## Code Style

- Use ES6+ JavaScript syntax
- Follow existing code formatting
- Add comments for complex logic
- Keep functions small and focused

## Testing

Before submitting a PR:
- Build the web assets successfully
- Test on an Android device or emulator
- Verify Bluetooth connectivity works
- Check that Gemini API integration functions correctly

## Reporting Issues

When reporting issues, please include:
- Android version
- Device model
- Steps to reproduce
- Expected vs actual behavior
- Any error messages or logs

## Questions?

Feel free to open an issue for questions or discussion.
