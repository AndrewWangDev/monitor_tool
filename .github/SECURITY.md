# Security Policy

The Toolkit development team takes the security and integrity of our open-source software seriously. This document outlines how to report vulnerabilities and our coordinated disclosure practices.

## Supported Versions

Only the latest release of Toolkit receives active security updates and vulnerability patches.

| Version | Supported          |
| :------ | :----------------- |
| 0.2.x   | :white_check_mark: |
| < 0.2.0 | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security issue or potential vulnerability in this repository, please report it privately:

1. **GitHub Private Vulnerability Reporting (Preferred)**:
   Navigate to the [Security Advisories](https://github.com/AndrewWangDev/monitor_tool/security/advisories) tab of this repository and click **"Report a vulnerability"**.
2. **Direct Security Contact**:
   Alternatively, email the maintainer directly at [me@andrewwangdev.com](mailto:me@andrewwangdev.com) with the subject line `[SECURITY] Potential Vulnerability in Toolkit`.

### What to Include in Your Report
To help us investigate effectively, please provide:
- A descriptive summary of the vulnerability.
- Proof-of-concept (PoC) code or step-by-step reproduction instructions.
- Potential impact and affected components (e.g., Rust backend, IPC handlers, or WebView interface).
- Any recommended remediations or mitigations.

## Response & Disclosure Process

- **Acknowledgment**: We strive to review and acknowledge all submitted vulnerability reports as soon as reasonably possible.
- **Investigation**: The maintainer will investigate the report, evaluate its severity, and determine an appropriate resolution path.
- **Coordination**: We ask reporters to maintain confidentiality until a coordinated patch and release advisory have been published.
- **Public Disclosure**: Once a patch is validated and released, we will publish a security advisory giving appropriate credit to the reporter (unless anonymity is requested).
