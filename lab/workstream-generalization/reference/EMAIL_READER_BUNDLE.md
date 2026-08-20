# `email_reader.js` reference

The InfoBIM v0.4 WorkStream loads a bundled/minified browser parser for `.msg` and `.eml` files:

- repository: `EliasMPJunior/infobim-wip`
- branch: `v0.4`
- path: `src/infobim/view/plugin/asset/js/email_reader.js`
- blob SHA: `657814d9503597430d19be48e17923ed0cdf3fda`
- size: 654,137 bytes

The file is a large minified dependency bundle, not the WorkStream semantic model. It is not duplicated byte-for-byte in this lab because the GitHub connector exposes the minified bundle as one oversized line. The source identity above is exact and should be used if the parser itself must be recovered.

For the OntoBDC generalization, treat e-mail parsing as a resource-preview adapter/dependency. WorkStream must not depend conceptually on Outlook `.msg`, RFC 822 `.eml`, or this particular bundled parser.
