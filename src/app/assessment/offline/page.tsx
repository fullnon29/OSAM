import OfflineNewAssessment from "@/components/assessment/OfflineNewAssessment";

// 신규 어르신은 서버에서 불러올 내용이 없으므로 이 화면은 연결 없이 동작합니다.
// 서버에서 받아오는 것이 없도록 일부러 정적으로 만들어, 신호가 없어도 열립니다.
export const dynamic = "force-static";

export const metadata = {
  title: "신규 어르신 욕구사정 (오프라인)",
};

export default function OfflineAssessmentPage() {
  return <OfflineNewAssessment />;
}
