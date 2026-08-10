import Link from "next/link";

export default function Header() {
  return (
    <header>
      <div className="wrap nav">
        <Link className="logo" href="/#top">
          <span className="mark" />
          오샘재가복지센터
        </Link>
        <nav className="nav-links">
          <a href="/#about">센터소개</a>
          <a href="/#services">서비스안내</a>
          <a href="/#ltci">장기요양보험</a>
          <a href="/#process">신청절차</a>
          <a href="/#news">소식·정보</a>
          <a href="/#pricing">비용안내</a>
          <a href="/#contact">오시는길</a>
          <Link className="staff-link" href="/training">
            종사자 교육
          </Link>
        </nav>
        <a className="nav-cta" href="/#contact">
          상담 신청
        </a>
      </div>
    </header>
  );
}
