# GA4 Handler

A handler for receiving and distributing events through the (older) Google Analytics 4/Google Tag Manager interface for collecting user interaction metrics on a national broadband distributor's infrastructure.

## ga4-handler.js

The handler interface designed to sit inside of a backend-rendered Perl application, where variables are loaded into the global scope ahead of time. The handler is intended to be resilient to partial data availability, and distribute signals in a way that matches an established ingest schema on Google's collector side.

## ga4-test-page.html

A simple tester interface to run the handler. It uses a mocked data composer (both static and random/dynamic) contained in `ga4-testing-data.js` to mimic the data provided on the live portal.

## ga4-testing-data.js

Static + random/dynamic data generator interface to mimic real signals.
