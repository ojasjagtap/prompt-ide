#!/usr/bin/env python3
"""
Test script for DSPy Python Bridge
Verifies that Python can communicate with Node.js via stdin/stdout
"""

import sys
import json
import time

def log_progress(message, data=None):
    """Send progress message to Node.js"""
    progress = {'type': 'progress', 'message': message}
    if data:
        progress['data'] = data
    print(json.dumps(progress), flush=True)

def main():
    """Test the bridge communication"""
    try:
        # Read configuration from stdin
        log_progress("Reading configuration...")
        config_json = sys.stdin.read()

        log_progress("Parsing configuration...")
        config = json.loads(config_json)

        log_progress("Configuration received", {
            'keys': list(config.keys())
        })

        # Simulate some work
        log_progress("Simulating optimization work...")
        time.sleep(1)

        log_progress("Checking Python environment...")

        # Check if DSPy is available
        try:
            import dspy
            log_progress(f"DSPy version: {dspy.__version__}")
            dspy_available = True
        except ImportError:
            log_progress("DSPy not installed (this is OK for bridge test)")
            dspy_available = False

        # Return success result
        result = {
            'type': 'success',
            'message': 'Bridge test successful',
            'python_version': sys.version,
            'dspy_available': dspy_available,
            'config_received': config
        }

        print(json.dumps(result), flush=True)

    except Exception as e:
        import traceback
        error_result = {
            'type': 'error',
            'message': str(e),
            'traceback': traceback.format_exc()
        }
        print(json.dumps(error_result), flush=True)
        sys.exit(1)

if __name__ == '__main__':
    main()
