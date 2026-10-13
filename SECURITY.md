# Security policy

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's "Report a vulnerability" button on the Security tab of this repository (private advisory). You will get a first response within a few days.

## Scope

ariana-report runs in the browser. These areas are security sensitive and reports about them are especially welcome:

- the expression sandbox (`packages/core/src/expressions`): anything that reaches globals, prototypes, `Function`, the DOM or the network from a template expression;
- the viewer renderer: markup, `allowHtml` text, image sources and URLs from templates or data turning into script execution or unexpected requests;
- template validation.

Supported versions: the latest minor release.
