import Head from 'expo-router/head';

import styles from './index.module.css';

const features = [
  {
    number: '01',
    title: 'End-to-end encrypted',
    copy: 'Audio and video are encrypted on the phones before they travel through LiveKit.',
  },
  {
    number: '02',
    title: 'Made for listening',
    copy: 'Audio-only mode stops receiving video and is designed to keep playing while your phone is locked.',
  },
  {
    number: '03',
    title: 'Pair, then disappear',
    copy: 'A random six-digit code works once, expires after five minutes, and never becomes an account.',
  },
];

const steps = [
  ['Baby phone', 'Place one iPhone near the crib and start the camera.'],
  ['Private code', 'Scan the QR code or enter six digits on your phone.'],
  ['Parent phone', 'Watch live video, or switch to audio when it is time to sleep.'],
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
    <div className={styles.phone} aria-label="Preview of the Nappio baby camera screen">
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
        <p>PAIRING CODE</p>
        <strong>482 193</strong>
        <small>Expires in 04:36</small>
      </div>
    </div>
  );
}

function AudioPreview() {
  const bars = [36, 58, 82, 48, 96, 68, 44, 74, 52];
  return (
    <div className={`${styles.phone} ${styles.parentPhone}`} aria-label="Preview of Nappio audio-only monitoring">
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
        <span>Show video</span>
        <strong>End</strong>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <>
      <Head>
        <title>Nappio — A private baby monitor between two phones</title>
        <meta
          name="description"
          content="Turn two iPhones into an encrypted baby monitor with live video, lock-screen audio, and one-time pairing."
        />
        <meta name="theme-color" content="#f6f3ec" />
        <meta property="og:title" content="Nappio — Rest easy. Stay close." />
        <meta
          property="og:description"
          content="An encrypted baby monitor made from the two phones you already have."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://tmoreton.github.io/nappio/" />
        <link rel="canonical" href="https://tmoreton.github.io/nappio/" />
      </Head>

      <div className={styles.site}>
        <header className={styles.header}>
          <a className={styles.brand} href="#top" aria-label="Nappio home">
            <BrandMark />
            <span>Nappio</span>
          </a>
          <nav aria-label="Main navigation">
            <a href="#how-it-works">How it works</a>
            <a href="#privacy">Privacy</a>
            <a className={styles.navCta} href="#beta">TestFlight beta</a>
          </nav>
        </header>

        <main id="top">
          <section className={styles.hero}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>A PRIVATE LINK BETWEEN TWO PHONES</p>
              <h1>Rest easy.<br />Stay close.</h1>
              <p className={styles.lede}>
                Turn the phones you already have into an encrypted baby monitor—with live video when you want it and audio when the screen is locked.
              </p>
              <div className={styles.heroActions}>
                <a className={styles.primaryCta} href="#beta">Join the TestFlight beta <span>↗</span></a>
                <a className={styles.textLink} href="#how-it-works">See how it works <span>↓</span></a>
              </div>
              <div className={styles.trustRow} aria-label="Nappio product highlights">
                <span>No account</span>
                <span>One-time pairing</span>
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

          <section className={styles.features} id="privacy">
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
              <h2>Two phones.<br />Three small steps.</h2>
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
              <h2>Nappio is heading to TestFlight.</h2>
              <p>The first private beta is being prepared for iPhone now.</p>
            </div>
            <div className={styles.betaBadge}>
              <BrandMark />
              <div><small>COMING TO</small><strong>TestFlight</strong></div>
            </div>
          </section>
        </main>

        <footer className={styles.footer}>
          <div className={styles.brand}><BrandMark /><span>Nappio</span></div>
          <p>Nappio is not a medical device and is not a substitute for adult supervision.</p>
          <span>© 2026 Nappio</span>
        </footer>
      </div>
    </>
  );
}
