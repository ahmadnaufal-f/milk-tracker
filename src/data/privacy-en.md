# Privacy Notice

**Last updated: 24 July 2026**

Milk Tracker ("the app", "we", "us") helps you log breast-pumping sessions and track your milk supply. This notice explains what information the app collects, how it is used, who it is shared with, and the choices you have. We've tried to keep it plain and honest — no dark patterns.

Milk Tracker is a personal project maintained by an individual developer. If you have any questions, you can reach us at **me@arkaes.dev**.

## The short version

- We store the pumping data you enter and your account's basic Google profile so you can sync across devices.
- Your data is stored in Google Firebase (servers in Singapore). We don't sell it, and we don't use advertising or analytics trackers.
- The optional AI Summary feature sends **de-identified** pumping data to OpenAI to generate your weekly summary — only if you turn it on. Your name and email are never sent.
- You can view, edit, and delete your data, turn AI off, or ask us to delete your account entirely.

## 1. Information we collect

**Account information (via Google Sign-In).** Signing in is handled by Firebase Authentication using your Google account. We receive and use your name, email address, profile photo, and a unique account ID. We use these to identify your account and show them in the app; we do not receive your Google password.

**Pumping data you enter.** For each session you log: the milk volume (ml), the duration (minutes), and the date and time it started. This is the core of the app.

**Your settings.** Your goals and preferences: target volume, target duration, and how many hours between pumping reminders.

**Optional AI context (only if you provide it).** To personalize AI summaries you may optionally add your baby's date of birth, your feeding method (exclusive or supplemental pumping), and your pumping goals. All of these fields are optional.

**Device & notification data.** If you allow notifications, we store a push notification token for your device so we can send pumping reminders. The app also keeps a copy of your data on your device (offline cache and a running timer) so it works without a connection.

**Anti-abuse signals.** To protect the service from bots and abuse, we use Google reCAPTCHA, which collects device and usage signals. Its use is governed by Google's privacy policy.

We do **not** collect analytics, advertising identifiers, location, or your contacts, and no third-party tracking SDKs are built into the app.

## 2. How we use your information

We use your information to:

- Save your pumping sessions and sync them across your devices.
- Show your history, summaries, and progress toward your goals.
- Send the pumping reminders you configure.
- Generate optional AI weekly summaries (only if you enable them — see below).
- Keep the service secure and prevent abuse.

We do not sell your personal information, and we do not use it for advertising.

## 3. AI Summaries (optional)

AI Summaries are **turned off by default**. If you turn the feature on, when you request a summary the app sends the following to our AI provider, **OpenAI**, to generate your weekly summary and answer follow-up questions:

- Your pumping sessions for the relevant weeks — date, time, duration, and volume.
- Your baby's **age** (calculated from the birthdate you entered — the exact birthdate itself is not sent), your feeding method, and your pumping goals, if you provided them.
- Follow-up questions you tap, along with your previous weekly summary for context.

This data is **de-identified**: your name, email, and account ID are **never** sent to OpenAI. It remains health-related information about your pumping, so we only send it with your explicit opt-in. OpenAI processes this data on servers in the United States. The generated summary is stored in your account and cached on your device.

You can turn AI Summaries off at any time in Settings. Turning it off does not affect your pumping logs.

**Not medical advice.** AI summaries are for general information only and are not medical advice. Always consult a lactation consultant or healthcare provider for guidance.

## 4. Push notifications

If you grant permission, we send reminders to pump based on your settings. To do this we store a notification token for your device and process it on our servers to deliver reminders. You can revoke notification permission at any time in your browser or device settings.

## 5. Where your data is stored and who processes it

Your data is stored and processed by **Google Firebase** (Firebase Authentication, Cloud Firestore, Cloud Messaging, Cloud Functions, and Hosting) on Google Cloud infrastructure located in Singapore. Google acts as our service provider for storing and delivering the app.

The only other third party that receives your data is **OpenAI**, and only for the optional AI Summaries feature described in Section 3.

We share data with these providers solely to operate the app. We do not sell your data or share it with advertisers or data brokers.

## 6. Data retention

We keep your account and pumping data for as long as your account exists so the app can show your history. You can delete individual sessions in the app at any time. If you want your account and all associated data deleted, contact us at **me@arkaes.dev** and we will remove it.

## 7. Your rights and choices

You can:

- **Access and edit** your pumping sessions and settings directly in the app.
- **Delete** individual sessions in the app.
- **Turn AI Summaries on or off** at any time in Settings.
- **Manage notifications** through your browser or device settings.
- **Sign out** at any time, and revoke the app's access to your Google account from your Google account settings.
- **Request full deletion** of your account and data by emailing **me@arkaes.dev**.

Depending on where you live, you may have additional rights over your personal data (such as access, correction, deletion, or withdrawing consent). We're happy to honor these — just contact us.

## 8. Security

Access to your data is restricted to your own account through Firebase security rules, and connections to the app are encrypted in transit. No method of storage or transmission is ever 100% secure, but we take reasonable steps to protect your information.

## 9. Children's privacy

Milk Tracker is intended for parents and caregivers. It is not directed to children, and we do not knowingly collect personal information from children. Any information about a baby (such as a birthdate) is entered by, and belongs to, the adult account holder.

## 10. Changes to this notice

We may update this notice from time to time. When we do, we'll revise the "Last updated" date at the top. Significant changes will be highlighted in the app.

## 11. Contact

Questions, requests, or concerns about your privacy? Email **me@arkaes.dev**.
