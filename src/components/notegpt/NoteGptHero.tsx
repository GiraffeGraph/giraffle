import styles from "./NoteGptWorkspace.module.css";

interface NoteGptHeroProps {
  notesCount: number;
  foldersCount: number;
  latestActivityLabel: string;
}

export function NoteGptHero({
  notesCount,
  foldersCount,
  latestActivityLabel,
}: NoteGptHeroProps) {
  return (
    <section className={styles.hero}>
      <div className={styles.heroCopy}>
        <div className={styles.eyebrow}>WORKSPACE COPILOT</div>
        <h1 className={styles.title}>NoteGPT</h1>
        <p className={styles.subtitle}>
          Notların, klasörlerin ve çalışma akışın için sakin, odaklı ve hızlı
          bir AI yüzeyi. Bir soru sor, yapı analizi iste ya da doğrudan görev ver.
        </p>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Notlar</span>
          <span className={styles.statValue}>{notesCount}</span>
          <span className={styles.statHint}>Çalışma alanındaki toplam not</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Klasörler</span>
          <span className={styles.statValue}>{foldersCount}</span>
          <span className={styles.statHint}>Mevcut organizasyon katmanı</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Son aktivite</span>
          <span className={styles.statValue}>{latestActivityLabel}</span>
          <span className={styles.statHint}>En yakın güncelleme zamanı</span>
        </div>
      </div>
    </section>
  );
}
