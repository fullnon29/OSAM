import Link from "next/link";
import Header from "@/components/site/Header";
import Footer from "@/components/site/Footer";
import ConsultationForm from "@/components/site/ConsultationForm";
import { createClient } from "@/lib/supabase/server";
import { categoryTagClass, type Post } from "@/lib/posts";
import { formatKst } from "@/lib/format";

const GRADE_TABLE = [
  ["1등급", "전적으로 다른 사람의 도움이 필요한 상태", "95점 이상"],
  ["2등급", "상당 부분 다른 사람의 도움이 필요한 상태", "75~95점 미만"],
  ["3등급", "부분적으로 다른 사람의 도움이 필요한 상태", "60~75점 미만"],
  ["4등급", "일정 부분 다른 사람의 도움이 필요한 상태", "51~60점 미만"],
  ["5등급", "치매 진단(경증)을 받은 어르신", "45~51점 미만"],
  ["인지지원등급", "치매 진단을 받은 어르신 중 5등급에 해당하지 않는 경우", "45점 미만"],
];

// 2026년 장기요양보험 방문요양 급여비용 기준, 일반 수급자(본인부담률 15%) 예시
// 기초생활수급자 0% / 의료급여 2종·차상위 6% / 그 외 차상위 감경 9%
const PRICE_TABLE = [
  ["30분", "2,720원", "전 등급"],
  ["60분", "3,910원", "전 등급"],
  ["90분", "5,360원", "전 등급"],
  ["120분", "6,820원", "전 등급"],
  ["180분", "9,590원", "전 등급"],
  ["240분", "11,210원", "3~5등급"],
];

const FAQS = [
  {
    q: "장기요양등급이 없어도 상담 가능한가요?",
    a: "네, 물론입니다. 장기요양등급 신청 방법부터 필요한 서류, 판정 절차까지 무료로 상세히 안내해 드립니다.",
  },
  {
    q: "본인부담금은 얼마나 나오나요?",
    a: "소득 수준과 감경 기준에 따라 달라집니다. 정확한 금액은 상담 시 안내해 드립니다.",
  },
  {
    q: "요양보호사가 마음에 들지 않으면 교체 가능한가요?",
    a: "네, 언제든 말씀해 주시면 다른 요양보호사로 재배정해 드립니다.",
  },
  {
    q: "서비스 이용 시간은 어떻게 되나요?",
    a: "30분부터 240분까지 어르신의 등급과 필요에 맞춰 조정 가능합니다.",
  },
  {
    q: "서비스 지역은 어디까지인가요?",
    a: "부산 연제구를 중심으로 인근 지역까지 서비스 가능합니다. 정확한 지역은 상담 시 확인해 드립니다.",
  },
];

export default async function Home() {
  const supabase = await createClient();
  const { data: posts } = await supabase
    .from("posts")
    .select("*")
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .limit(3);
  const newsItems = (posts ?? []) as Post[];

  return (
    <>
      <Header />

      <main id="top">
        <section className="hero">
          <div className="hero-fade" />
          <div className="wrap">
            <div className="hero-content">
              <div className="badge-loc">
                국민건강보험공단 지정 · 장기요양 방문요양 전문
              </div>
              <h1 className="headline">
                당신의 삶을 품은
                <br />
                따뜻한 방문요양,
                <br />
                <span className="hl-brand">오샘재가복지센터</span>
              </h1>
              <p className="lead">
                장기요양등급 신청부터 방문요양·방문목욕까지, 어르신 한 분 한
                분의 삶을 존중하며 가족처럼 곁을 지킵니다.
              </p>
              <div className="hero-actions">
                <a className="btn-primary" href="#contact">
                  💬 무료 상담 시작하기 ↗
                </a>
                <a className="btn-ghost" href="tel:051-637-7355">
                  📞 051-637-7355 전화 상담
                </a>
              </div>
              <div className="stat-row">
                <div className="stat-chip">
                  <div className="num">15년+</div>
                  <div className="lbl">재가복지 경력</div>
                </div>
                <div className="stat-chip">
                  <div className="num">평가 A</div>
                  <div className="lbl">2년 연속 수상</div>
                </div>
                <div className="stat-chip">
                  <div className="num">98%</div>
                  <div className="lbl">재이용 만족도</div>
                </div>
                <div className="stat-chip">
                  <div className="num">60+</div>
                  <div className="lbl">전문 요양보호사</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="about" style={{ background: "var(--white)" }}>
          <div className="wrap about-single">
            <h2 className="about-headline">
              <span className="hl-coral">가족처럼,</span> 그러나{" "}
              <span className="hl-green">전문가답게</span>
              <br />
              어르신 곁에 머물겠습니다.
            </h2>
            <p className="about-lead">
              오샘재가복지센터는 국민건강보험공단이 지정한 장기요양 재가급여
              기관으로, 방문요양·방문목욕 서비스를 통해 어르신의 일상과
              존엄을 지켜드립니다. 15년 넘게 부산 지역 어르신 곁을 지켜온
              검증된 요양보호사들이 함께합니다.
            </p>
            <div className="feature-grid3">
              <div className="feature-card2">
                <div className="ico green">✓</div>
                <h3>국민건강보험공단 지정 기관</h3>
                <p>등급자는 월 15%~0% 부담으로 이용 가능하십니다.</p>
              </div>
              <div className="feature-card2">
                <div className="ico coral">🛡</div>
                <h3>검증된 요양보호사 60명 이상</h3>
                <p>요양보호사 자격증과 교육을 받은 요양보호사만 배정합니다.</p>
              </div>
              <div className="feature-card2">
                <div className="ico tan">♥</div>
                <h3>1:1 맞춤 돌봄 계획</h3>
                <p>
                  어르신 성향, 건강 상태, 가족의 요구를 반영한 개인별 이용
                  계획을 수립합니다.
                </p>
              </div>
            </div>
            <p className="about-address">
              📍 부산광역시 연제구 연수로 220-1, 2층
            </p>
          </div>
        </section>

        <section id="services" className="band-light">
          <div className="wrap">
            <div className="section-head">
              <h2>방문요양 제공 서비스</h2>
              <p>
                요양보호사가 어르신 댁을 직접 방문하여
                신체활동·가사·정서·인지지원을 종합적으로 제공하는 맞춤형
                재가급여 서비스입니다.
              </p>
            </div>
            <div className="service-grid">
              <div className="service-card">
                <div className="icon">🧍</div>
                <h3>신체활동 지원</h3>
                <ul>
                  <li>세면·목욕 보조</li>
                  <li>옷 갈아입기</li>
                  <li>이동·보행 도움</li>
                  <li>체위 변경</li>
                </ul>
              </div>
              <div className="service-card">
                <div className="icon">🏠</div>
                <h3>가사활동 지원</h3>
                <ul>
                  <li>식사 준비·설거지</li>
                  <li>청소·정리정돈</li>
                  <li>세탁·다림질</li>
                  <li>장보기 동행</li>
                </ul>
              </div>
              <div className="service-card">
                <div className="icon">💬</div>
                <h3>정서 지원</h3>
                <ul>
                  <li>말벗 서비스</li>
                  <li>산책 동행</li>
                  <li>취미활동 지원</li>
                  <li>가족 소통 지원</li>
                </ul>
              </div>
              <div className="service-card">
                <div className="icon">🧩</div>
                <h3>인지활동형 서비스</h3>
                <ul>
                  <li>회상 요법</li>
                  <li>인지 훈련 활동</li>
                  <li>그림·색칠 프로그램</li>
                  <li>기억력 게임</li>
                </ul>
              </div>
              <div className="service-card">
                <div className="icon">📋</div>
                <h3>개인활동 지원</h3>
                <ul>
                  <li>병원 동행</li>
                  <li>관공서 방문</li>
                  <li>은행 업무 지원</li>
                  <li>약국 대행</li>
                </ul>
              </div>
              <div className="service-card">
                <div className="icon">💊</div>
                <h3>건강·간호 지원</h3>
                <ul>
                  <li>복약 관리</li>
                  <li>혈압·혈당 확인</li>
                  <li>건강 상태 기록</li>
                  <li>위생 관리</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section id="ltci" className="ltci">
          <div className="wrap">
            <div className="section-head">
              <h2>장기요양보험이란?</h2>
              <p>
                고령이나 노인성 질병으로 6개월 이상 스스로 일상생활을 하기
                어려운 어르신을 국가가 함께 돌보는 사회보험 제도입니다.
              </p>
            </div>
            <div className="ltci-grid">
              <div>
                <div className="info-box">
                  <h3>신청 대상</h3>
                  <ul>
                    <li>만 65세 이상 어르신</li>
                    <li>
                      만 65세 미만이지만 치매·뇌혈관성 질환 등 노인성 질병을
                      가진 분
                    </li>
                    <li>6개월 이상 스스로 일상생활 수행이 어려운 분</li>
                  </ul>
                </div>
                <div className="info-box">
                  <h3>본인부담금 감경 대상</h3>
                  <ul>
                    <li>기초생활수급자는 본인부담금 전액 면제</li>
                    <li>
                      의료급여 수급권자와 감경 대상자는 40~60% 감경 혜택
                    </li>
                  </ul>
                </div>
              </div>
              <table className="grade-table">
                <thead>
                  <tr>
                    <th>등급</th>
                    <th>상태 설명</th>
                    <th>인정점수</th>
                  </tr>
                </thead>
                <tbody>
                  {GRADE_TABLE.map((row) => (
                    <tr key={row[0]}>
                      <td>{row[0]}</td>
                      <td>{row[1]}</td>
                      <td>{row[2]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="process" className="band-light">
          <div className="wrap">
            <div className="section-head">
              <h2>신청 절차 안내</h2>
              <p>
                처음이신 분도 걱정 없이 이용하실 수 있도록, 상담부터 서비스
                시작까지 모든 과정을 함께 도와드립니다.
              </p>
            </div>
            <div className="process-list">
              <div className="quick-card">
                <div className="icon">📞</div>
                <div className="lbl">전화 신청</div>
                <div className="val">051-637-7355</div>
                <div className="sub">평일 09:00–18:00 상담원 안내</div>
              </div>
              <div className="quick-card">
                <div className="icon">📍</div>
                <div className="lbl">방문 신청</div>
                <div className="val">연제구 연수로 220-1, 2층</div>
                <div className="sub">사전 예약 시 신속 접수 가능</div>
              </div>
              <div className="quick-card">
                <div className="icon">✉️</div>
                <div className="lbl">온라인 신청</div>
                <div className="val">하단 상담 신청 폼 작성</div>
                <div className="sub">1시간 이내 담당자 회신</div>
              </div>
            </div>
            <div className="step-list">
              {[
                ["상담·문의", "전화 또는 방문 상담을 통해 어르신의 상태와 원하시는 서비스를 확인합니다."],
                ["장기요양 인정 신청", "국민건강보험공단에 장기요양 인정 신청을 접수합니다. 저희가 도와드립니다."],
                ["방문조사·등급판정", "공단 직원이 방문조사를 진행하고 등급판정위원회에서 등급이 결정됩니다."],
                ["급여 계약 체결", "장기요양인정서와 표준장기이용계획서를 바탕으로 오샘재가복지센터와 계약합니다."],
                ["서비스 이용 시작", "요양보호사가 어르신 댁으로 방문하여 개별 케어플랜에 따라 서비스를 시작합니다."],
              ].map(([title, desc], i) => (
                <div className="step-row" key={title}>
                  <div className="step-num">{i + 1}</div>
                  <div>
                    <h3>{title}</h3>
                    <p>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="news" className="band-warm">
          <div className="wrap">
            <div className="news-head">
              <div>
                <h2
                  style={{
                    fontSize: 30,
                    color: "var(--pine-deep)",
                    fontWeight: 600,
                    marginBottom: 8,
                  }}
                >
                  오샘의 소식과{" "}
                  <span style={{ color: "var(--danger)" }}>요양 정보</span>
                </h2>
                <p style={{ color: "var(--ink-soft)", fontSize: 14.5 }}>
                  센터의 새로운 소식과 어르신 건강·복지 정보를 정기적으로
                  전해 드립니다.
                </p>
              </div>
              <Link className="btn-ghost" href="/news">
                전체 글 보기 →
              </Link>
            </div>

            {newsItems.length === 0 ? (
              <div className="empty-note">아직 등록된 글이 없습니다.</div>
            ) : (
              <div className="news-grid">
                {newsItems.map((post) => (
                  <Link
                    className="news-card"
                    key={post.id}
                    href={`/news/${post.id}`}
                    style={{ display: "block" }}
                  >
                    <div className="news-thumb">{post.category}</div>
                    <div className="news-body">
                      <div className="news-meta">
                        <span className={`news-tag ${categoryTagClass(post.category)}`}>
                          {post.category}
                        </span>
                        <span className="news-date">
                          {formatKst(post.published_at).slice(0, 10)}
                        </span>
                      </div>
                      <h3>{post.title}</h3>
                      {post.excerpt && <p>{post.excerpt}</p>}
                      <div className="news-foot">
                        <span>
                          {post.read_minutes ? `⏱ ${post.read_minutes}분` : ""}
                        </span>
                        <span className="read">더 읽기 →</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>

        <section id="pricing" className="band-warm">
          <div className="wrap">
            <div className="section-head">
              <h2>방문요양 비용 안내</h2>
              <p>
                본인부담금은 소득 수준과 감경 기준에 따라 달라질 수 있습니다.
              </p>
            </div>
            <div className="pricing-note">
              ⚠️ 2026년 장기요양보험 방문요양 급여비용 기준 본인부담금(일반
              수급자 15%) 안내입니다. 기초생활수급자는 0%, 의료급여
              2종·차상위 감경 대상은 6%, 그 외 차상위 감경 대상은 9%가
              적용됩니다. 정확한 금액은 상담 시 다시 안내해 드립니다.
            </div>
            <table className="price-table">
              <thead>
                <tr>
                  <th>서비스 시간</th>
                  <th>본인부담금(15%)</th>
                  <th>이용 가능 등급</th>
                </tr>
              </thead>
              <tbody>
                {PRICE_TABLE.map((row) => (
                  <tr key={row[0]}>
                    <td>{row[0]}</td>
                    <td>{row[1]}</td>
                    <td>{row[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="faq" className="band-light">
          <div className="wrap">
            <div className="section-head">
              <h2>자주 묻는 질문</h2>
            </div>
            <div className="faq-list">
              {FAQS.map((item, i) => (
                <details key={item.q} open={i === 0}>
                  <summary>Q. {item.q}</summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <div className="family-band">
          <div className="wrap">
            <h2>고객이 아닌 &apos;가족&apos;입니다.</h2>
            <h3>&quot;돌봄은 서비스가 아니라, 사람을 향한 약속입니다.&quot;</h3>
            <p>
              오샘재가복지센터는 어르신의 생활환경, 건강 상태, 정서까지
              고려한 맞춤형 방문요양 서비스를 통해 어르신과 가족 모두가
              안심할 수 있는 돌봄을 실천합니다.
            </p>
          </div>
        </div>

        <section id="contact" className="contact band-warm">
          <div className="wrap contact-grid">
            <div className="contact-info">
              <h2>상담 및 오시는 길</h2>
              <div className="info-line">
                <div className="k">주소</div>
                <div>부산광역시 연제구 연수로 220-1, 2층</div>
              </div>
              <div className="info-line">
                <div className="k">전화</div>
                <div>051-637-7355 (평일 09:00–18:00, 긴급 상담 24시간)</div>
              </div>
              <div className="info-line">
                <div className="k">이메일</div>
                <div>jojo5506@naver.com</div>
              </div>
              <div className="map-box">
                지도 영역 (네이버/카카오 지도 연동 위치)
              </div>
            </div>
            <div>
              <ConsultationForm />
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
