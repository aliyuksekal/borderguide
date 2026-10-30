# BorderGuide

Vize ve kalış süresi takip uygulaması (Android). Geliştirici: **matali** · matali.truz@gmail.com

- Paket adı: `com.benim.borderguide`
- Diller: Türkçe, English, O'zbekcha, Русский, 한국어, 中文
- Temalar: Açık, Koyu, AMOLED, Otomatik
- Veriler yalnızca cihazda saklanır (hesap, reklam, takip yok).

## Derleme

`main` dalına her yükleme GitHub Actions ile otomatik olarak **imzalı APK ve AAB** üretir:

- **Actions** sekmesi → son çalıştırma → *Artifacts*
- veya **Releases** sayfası → `BorderGuide-1.0.N.apk` / `.aab`

Sürüm kodu Actions çalıştırma numarasıdır; her yeni APK bir öncekinin **üstüne kurulur**.
Elle derlemek için: Actions → "İmzalı APK ve AAB derle" → *Run workflow*.

### İmza anahtarı (çok önemli)

İmza anahtarı repoda **tutulmaz**. Otomatik imza için **Settings → Secrets and variables → Actions** içine iki secret eklenir:
`KEYSTORE_BASE64` (anahtar dosyasının base64 hali) ve `KEYSTORE_PASSWORD`. Bunlar yoksa Actions imzasız APK/AAB üretir.
Anahtarın yedeğini güvenli bir yerde sakla. Kaybolursa güncellemeler eski sürümün üstüne kurulamaz.

## Klasörler

| Klasör | İçerik |
|---|---|
| `web/` | Uygulamanın arayüzü (HTML/JS/CSS), doğrudan APK'nın içine girer |
| `web/i18n.js` | 6 dildeki arayüz metinleri |
| `web/data.js` | Ülkeler, varsayılan kalış kuralları, ceza bilgileri, kayıt kuralları |
| `app/` | Android sarmalayıcı (WebView) |
| `tools/build-css.mjs` | `web/app.css` dosyasını Tailwind ile üretir |
| `law-updates.json` | Uygulamanın internetten okuduğu yasa değişikliği bildirimleri |

## Yeni yasa değişikliği bildirimi eklemek

`law-updates.json` dosyasına yeni bir kayıt ekle (benzersiz `id`, `date` = `YYYY-MM-DD`, `title` ve `body` dillere göre).
Uygulama günde bir kez bu dosyayı kontrol eder; yeni APK gerekmez.
Not: Uygulamanın bu dosyayı okuyabilmesi için reponun **Public** olması gerekir.

## Arayüzde sınıf değiştirince

Yeni Tailwind sınıfı eklediysen `node tools/build-css.mjs web` ile `web/app.css` yeniden üretilmeli.
