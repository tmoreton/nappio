import Head from 'expo-router/head';

import styles from './index.module.css';

const features = [
  {
    number: '01',
    title: 'Encrypted phone-to-phone',
    copy: 'Audio and video are encrypted by WebRTC and travel directly between your phones whenever possible.',
  },
  {
    number: '02',
    title: 'Made for listening',
    copy: 'Audio-only mode stops receiving video and is designed to keep playing while your phone is locked.',
  },
  {
    number: '03',
    title: 'Invite, then disappear',
    copy: 'A random six-digit invite can connect multiple Parent devices for five minutes and never becomes an account.',
  },
];

const steps = [
  ['Baby device', 'Place one iPhone or iPad near the crib and start the camera.'],
  ['Private invite', 'Scan the QR code or enter six digits on each Parent device.'],
  ['Parent devices', 'Watch, listen, or hold to talk back from any connected Parent device.'],
];

function BrandMark() {
  return (
    <span className={styles.brandMark} aria-hidden="true">
      <span className={styles.brandMoon} />
      <span className={styles.brandStar} />
    </span>
  );
}

function CameraPreview() {
  return (
    <div className={styles.phone} aria-label="Preview of the NapNear baby camera screen">
      <div className={styles.phoneNotch} />
      <div className={styles.cameraScene}>
        <div className={styles.sceneGlow} />
        <div className={styles.cribRail} />
        <div className={styles.sleepingBaby}>
          <span className={styles.babyHead} />
          <span className={styles.babyBody} />
        </div>
      </div>
      <div className={styles.livePill}>
        <span /> Parent connected
      </div>
      <div className={styles.codeSheet}>
        <p>ROOM INVITE</p>
        <strong>482 193</strong>
        <small>Expires in 04:36</small>
      </div>
    </div>
  );
}

function AudioPreview() {
  const bars = [36, 58, 82, 48, 96, 68, 44, 74, 52];
  return (
    <div className={`${styles.phone} ${styles.parentPhone}`} aria-label="Preview of NapNear audio-only monitoring">
      <div className={styles.phoneNotch} />
      <div className={styles.audioScreen}>
        <div className={styles.listeningPill}>
          <span /> Monitoring live
        </div>
        <div className={styles.audioOrb}>♪</div>
        <h3>Listening in</h3>
        <div className={styles.wave} aria-hidden="true">
          {bars.map((height, index) => (
            <span key={index} style={{ height }} />
          ))}
        </div>
        <p>Audio continues when your phone is locked.</p>
      </div>
      <div className={styles.audioControls}>
        <span>Hold to talk</span>
        <strong>End</strong>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <>
      <Head>
        <title>NapNear — A private baby monitor between phones</title>
        <meta
          name="description"
          content="Turn your iPhone or iPad into an encrypted baby monitor with live video, talk-back, lock-screen audio, and private room invites."
        />
        <meta name="theme-color" content="#f6f3ec" />
        <meta property="og:title" content="NapNear — Rest easy. Stay close." />
        <meta
          property="og:description"
          content="An encrypted baby monitor made from the phones you already have."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://napnear.com/" />
        <meta property="og:site_name" content="NapNear" />
        <meta
          property="og:image"
          content="https://napnear.com/og.png"
        />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:width" content="1731" />
        <meta property="og:image:height" content="909" />
        <meta
          property="og:image:alt"
          content="NapNear — Rest easy. Stay close. A private baby monitor between your devices."
        />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="NapNear — Rest easy. Stay close." />
        <meta
          name="twitter:description"
          content="An encrypted baby monitor made from the phones you already have."
        />
        <meta
          name="twitter:image"
          content="https://napnear.com/og.png"
        />
        <meta
          name="twitter:image:alt"
          content="NapNear — Rest easy. Stay close. A private baby monitor between your devices."
        />
        <link rel="canonical" href="https://napnear.com/" />
      </Head>

      <div className={styles.site}>
        <header className={styles.header}>
          <a className={styles.brand} href="#top" aria-label="NapNear home">
            <BrandMark />
            <span>NapNear</span>
          </a>
          <nav aria-label="Main navigation">
            <a href="#how-it-works">How it works</a>
            <a href="#privacy-policy">Privacy</a>
            <a href="#support">Support</a>
            <a className={styles.navCta} href="#beta">TestFlight beta</a>
          </nav>
        </header>

        <main id="top">
          <section className={styles.hero}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>A PRIVATE ROOM BETWEEN YOUR DEVICES</p>
              <h1>Rest easy.<br />Stay close.</h1>
              <p className={styles.lede}>
                Turn the devices you already have into an encrypted baby monitor—with live video, push-to-talk, and audio when the screen is locked.
              </p>
              <div className={styles.heroActions}>
                <a className={styles.primaryCta} href="#beta">Join the TestFlight beta <span>↗</span></a>
                <a className={styles.textLink} href="#how-it-works">See how it works <span>↓</span></a>
              </div>
              <div className={styles.trustRow} aria-label="NapNear product highlights">
                <span>No account</span>
                <span>Private room invites</span>
                <span>No recording</span>
              </div>
            </div>

            <div className={styles.heroVisual}>
              <div className={styles.sun} />
              <CameraPreview />
              <AudioPreview />
              <div className={styles.encryptionBadge}>
                <span>◆</span>
                <div><strong>Encrypted</strong><small>phone to phone</small></div>
              </div>
            </div>
          </section>

          <section className={styles.statement}>
            <p>Built for the quiet moments.</p>
            <h2>A baby monitor should help you pay attention—not ask for more of it.</h2>
          </section>

          <section className={styles.features} id="security">
            <div className={styles.sectionIntro}>
              <p className={styles.eyebrow}>CALM BY DESIGN</p>
              <h2>The essentials, thoughtfully handled.</h2>
            </div>
            <div className={styles.featureGrid}>
              {features.map((feature) => (
                <article key={feature.number} className={styles.featureCard}>
                  <span>{feature.number}</span>
                  <h3>{feature.title}</h3>
                  <p>{feature.copy}</p>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.how} id="how-it-works">
            <div className={styles.howCopy}>
              <p className={styles.eyebrow}>UP AND RUNNING IN A MINUTE</p>
              <h2>Your devices.<br />Three small steps.</h2>
              <p>No new hardware, cloud account, or complicated home-network setup.</p>
            </div>
            <ol className={styles.steps}>
              {steps.map(([title, copy], index) => (
                <li key={title}>
                  <span>0{index + 1}</span>
                  <div><h3>{title}</h3><p>{copy}</p></div>
                </li>
              ))}
            </ol>
          </section>

          <section className={styles.beta} id="beta">
            <div>
              <p className={styles.eyebrow}>FIRST NIGHT SOON</p>
              <h2>NapNear is coming to the App Store.</h2>
              <p>Built for iPhone and iPad, with a private TestFlight beta available now.</p>
            </div>
            <div className={styles.betaBadge}>
              <BrandMark />
              <div><small>COMING TO THE</small><strong>App Store</strong></div>
            </div>
          </section>

          <section className={styles.legal} id="privacy-policy">
            <div className={styles.legalIntro}>
              <p className={styles.eyebrow}>PRIVACY POLICY · UPDATED SEPTEMBER 9, 2026</p>
              <h2>Private by design, explained plainly.</h2>
              <p>
                NapNear makes a temporary private room between phones. It does not create accounts, sell personal information, use advertising analytics, or provide recording.
              </p>
            </div>
            <div className={styles.legalGrid}>
              <article>
                <h3>Camera, microphone, and alerts</h3>
                <p>The Baby Unit uses its camera and microphone for live monitoring. A Parent Unit uses its microphone only while push-to-talk is held. Optional notifications report sound, interruptions, or Baby Unit power concerns while monitoring is active.</p>
              </article>
              <article>
                <h3>Temporary pairing data</h3>
                <p>Cloudflare temporarily stores a random code, room identifier, hashed role-specific recovery credentials, single-use signaling tickets, and expiry times. Codes expire after five minutes. Active session records renew for up to 30 days at a time and are deleted when they expire. A random installation identifier and network address are processed only to prevent abuse.</p>
              </article>
              <article>
                <h3>Encrypted live media</h3>
                <p>WebRTC sends encrypted media directly between phones whenever possible. If a direct path is blocked, Cloudflare TURN forwards the encrypted packets. NapNear does not provide server-side recording. To operate and budget the service, NapNear records whether a Parent connection was direct or relayed and gives TURN a one-way room identifier. Cloudflare may process connection metadata and operational logs under its privacy and security practices.</p>
              </article>
              <article>
                <h3>On-device storage and deletion</h3>
                <p>Recovery credentials and a random installation identifier are protected by iOS Keychain or Android Keystore. The identifier is not an Apple advertising identifier and is not used for tracking. Ending a room removes the saved credential and requests immediate server deletion; otherwise server session records are automatically removed at expiry.</p>
              </article>
              <article>
                <h3>Children and safety</h3>
                <p>NapNear is intended for adults and does not request a child profile or intentionally collect information directly from children. It is not a medical device or a substitute for adult supervision.</p>
              </article>
              <article>
                <h3>Questions and requests</h3>
                <p>For privacy questions, access or deletion requests, email <a href="mailto:tmoreton89@gmail.com?subject=NapNear%20privacy">tmoreton89@gmail.com</a>.</p>
              </article>
            </div>
          </section>

          <section className={styles.support} id="support">
            <div>
              <p className={styles.eyebrow}>HELP WHEN YOU NEED IT</p>
              <h2>NapNear support</h2>
              <p>For connection help, beta feedback, or a technical problem, contact the developer directly.</p>
            </div>
            <div className={styles.supportActions}>
              <a className={styles.primaryCta} href="mailto:tmoreton89@gmail.com?subject=NapNear%20support">Email support <span>↗</span></a>
              <a className={styles.textLink} href="https://github.com/tmoreton/nappio/issues/new">Report an issue <span>↗</span></a>
            </div>
          </section>
        </main>

        <footer className={styles.footer}>
          <div className={styles.brand}><BrandMark /><span>NapNear</span></div>
          <p>NapNear is not a medical device and is not a substitute for adult supervision.</p>
          <span><a href="#privacy-policy">Privacy</a> · <a href="#support">Support</a><br />© 2026 NapNear</span>
        </footer>
      </div>
    </>
  );
}
