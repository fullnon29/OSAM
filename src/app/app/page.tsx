import type { Metadata } from "next";
import Header from "@/components/site/Header";
import Footer from "@/components/site/Footer";
import release from "@/guide-content/app-release.json";

export const metadata: Metadata = {
  title: "평가 길잡이 앱 받기 | 오샘재가복지센터",
  description: "오샘재가복지센터 요양보호사 선생님용 「평가 길잡이」 안드로이드 앱 다운로드",
};

// 카카오톡이 APK 파일 전송을 막아서, 이 주소(osamcare.com/app)를 보내 선생님들이 직접 받게 한다.
export default function AppDownloadPage() {
  return (
    <>
      <Header />
      <main>
        <section className="band-light">
          <div className="wrap" style={{ maxWidth: 640 }}>
            <div className="section-head">
              <div className="eyebrow">APP</div>
              <h2>평가 길잡이 앱 받기</h2>
              <p>오샘재가복지센터 요양보호사 선생님용 안드로이드 앱입니다.</p>
            </div>

            <a
              className="btn"
              href="/app/download"
              style={{ display: "block", textAlign: "center", fontSize: 20, padding: "20px 16px" }}
            >
              📲 앱 내려받기 (안드로이드)
            </a>
            <p style={{ textAlign: "center", fontSize: 14, color: "var(--ink-soft)", marginTop: 8 }}>
              버전 {release.version} · 약 {release.sizeMB}MB · {release.updatedAt} 올림
            </p>

            <div style={{ marginTop: 28, fontSize: 16, lineHeight: 1.8 }}>
              <h3 style={{ fontSize: 18, marginBottom: 8 }}>설치 방법</h3>
              <ol style={{ paddingLeft: 22 }}>
                <li>
                  <b>카카오톡에서 이 페이지를 여셨다면</b> 오른쪽 위 <b>⋮</b>(또는 공유) 버튼을 눌러{" "}
                  <b>「다른 브라우저로 열기」</b>(크롬·삼성 인터넷)를 고르세요. 카카오톡 안에서는 내려받기가 안 될 수 있습니다.
                </li>
                <li>위의 <b>「앱 내려받기」</b>를 누르세요.</li>
                <li>다 받아지면 알림창이나 「내 파일 → 다운로드」에서 파일을 눌러 <b>설치</b>하세요.</li>
                <li>
                  「출처를 알 수 없는 앱」이라고 나오면 <b>설정 → 이 출처 허용</b>을 켜고 다시 설치하세요. 센터에서 만든 앱이라
                  플레이스토어에 없어서 나오는 안내입니다.
                </li>
                <li>앱을 열고 「처음 시작하기」에서 성함·생년월일·전화번호를 넣으면 시작됩니다.</li>
              </ol>
              <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 12 }}>
                새 버전이 나오면 같은 방법으로 받아 설치하시면 됩니다(기록은 그대로 남습니다). 문의는 사무실로 연락해 주세요.
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
