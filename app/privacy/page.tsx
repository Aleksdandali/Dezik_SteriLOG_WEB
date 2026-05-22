import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — Dezik Staff',
  description: 'Privacy policy for the Dezik Staff mobile application.',
};

// Static privacy policy referenced from the App Store listing and inside the
// Dezik Staff iOS app. Keep wording neutral and accurate to actual data flows.
export default function PrivacyPage() {
  const updated = 'May 22, 2026';
  return (
    <main style={styles.main}>
      <article style={styles.article}>
        <h1 style={styles.h1}>Privacy Policy — Dezik Staff</h1>
        <p style={styles.meta}>Last updated: {updated}</p>

        <p>
          This Privacy Policy describes how Dezik (the &ldquo;Company&rdquo;,
          &ldquo;we&rdquo;) handles information collected through the
          <strong> Dezik Staff </strong>
          mobile application (the &ldquo;App&rdquo;). The App is a
          business-to-business tool used internally by Dezik employees to
          manage production, inventory and order operations. It is not
          intended for the general public.
        </p>

        <h2 style={styles.h2}>1. Information we collect</h2>
        <ul>
          <li>
            <strong>Account identifiers.</strong> Staff name, role, Telegram
            user ID and optional location, populated by an administrator
            before login.
          </li>
          <li>
            <strong>Authentication token.</strong> A short-lived signed token
            issued after the user enters a 6-digit code obtained from our
            Telegram bot. Stored in the device&rsquo;s Keychain (iOS) or
            Keystore (Android).
          </li>
          <li>
            <strong>Push notification token.</strong> An Expo / APNs token
            used solely to deliver order and chat notifications to the user
            who registered the device.
          </li>
          <li>
            <strong>Operational content.</strong> Order numbers, customer
            phone/address fields synced from our KeyCRM-based back-office
            (visible only to authorised staff), inventory counts, salary
            entries, expense receipts and chat messages that the user
            explicitly enters or attaches.
          </li>
          <li>
            <strong>Photos and files.</strong> When the user attaches a
            photo (e.g. of a receipt or shipping document) the App uploads
            that file to our private storage. The App never accesses photos
            the user does not select.
          </li>
        </ul>

        <h2 style={styles.h2}>2. How we use the information</h2>
        <p>We use the information solely to:</p>
        <ul>
          <li>Authenticate the user and authorise actions in the App.</li>
          <li>Display orders, inventory and other operational data to staff.</li>
          <li>Deliver push notifications related to the user&rsquo;s work.</li>
          <li>Maintain an internal audit trail of staff actions.</li>
        </ul>
        <p>
          We do <strong>not</strong> sell, rent or share personal data with
          third parties for advertising. We do <strong>not</strong> track
          users across other applications or websites. The App contains no
          third-party advertising SDKs.
        </p>

        <h2 style={styles.h2}>3. Third-party services</h2>
        <ul>
          <li>
            <strong>Supabase</strong> — database and authenticated storage
            (EU region).
          </li>
          <li>
            <strong>Expo Push Service</strong> — delivery of push
            notifications.
          </li>
          <li>
            <strong>KeyCRM</strong> — source of order and customer records,
            used only when the user is authenticated.
          </li>
          <li>
            <strong>Telegram Bot API</strong> — used to issue the 6-digit
            login code; we receive only the Telegram user ID of the staff
            member who requested the code.
          </li>
        </ul>

        <h2 style={styles.h2}>4. Data retention</h2>
        <p>
          Authentication tokens are valid for up to 30 days and can be
          revoked at any time by signing out. Operational records are
          retained for as long as required to run the business and to meet
          accounting obligations under Ukrainian law.
        </p>

        <h2 style={styles.h2}>5. Your rights</h2>
        <p>
          You may request access to, correction of, or deletion of your
          personal data by contacting{' '}
          <a href="mailto:gloss.odessa@gmail.com">gloss.odessa@gmail.com</a>.
          Because the App is provided to staff by their employer, account
          provisioning and removal is handled by your administrator.
        </p>

        <h2 style={styles.h2}>6. Children</h2>
        <p>
          The App is not directed to children under 13 and is not intended
          for personal use; it is provided to adult employees only.
        </p>

        <h2 style={styles.h2}>7. Changes to this policy</h2>
        <p>
          We may update this policy from time to time. The &ldquo;Last
          updated&rdquo; date above reflects the most recent revision.
        </p>

        <h2 style={styles.h2}>8. Contact</h2>
        <p>
          Dezik
          <br />
          Odesa, Ukraine
          <br />
          <a href="mailto:gloss.odessa@gmail.com">gloss.odessa@gmail.com</a>
        </p>
      </article>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: '100vh',
    background: '#F8FAFC',
    padding: '40px 16px',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: '#111827',
    lineHeight: 1.6,
  },
  article: {
    maxWidth: 760,
    margin: '0 auto',
    background: '#FFFFFF',
    padding: '32px 40px',
    borderRadius: 16,
    border: '1px solid #E5E7EB',
  },
  h1: { fontSize: 28, fontWeight: 700, marginBottom: 4 },
  h2: { fontSize: 18, fontWeight: 700, marginTop: 28, marginBottom: 8 },
  meta: { color: '#6B7280', fontSize: 14, marginBottom: 24 },
};
