"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { usernameToEmail } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const data = new FormData(e.currentTarget);
    const username = String(data.get("username") || "");
    const password = String(data.get("password") || "");

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });

    setLoading(false);
    if (signInError) {
      setError("아이디 또는 비밀번호가 올바르지 않습니다.");
      return;
    }

    router.push("/training");
    router.refresh();
  }

  return (
    <>
      <div className="app-topbar">
        <Link className="app-back" href="/">
          ← 홈페이지로 돌아가기
        </Link>
      </div>
      <div className="app-wrap">
        <div className="login-box">
          <h2>종사자 교육 시스템</h2>
          <div className="sub">아이디와 비밀번호를 입력해 주세요.</div>
          {error && <div className="form-error">{error}</div>}
          <form onSubmit={handleSubmit}>
            <input type="text" name="username" placeholder="아이디" required />
            <input
              type="password"
              name="password"
              placeholder="비밀번호"
              required
            />
            <button className="btn" type="submit" disabled={loading}>
              {loading ? "로그인 중..." : "로그인"}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
