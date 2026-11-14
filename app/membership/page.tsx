"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import MembershipCenter from "@/components/MembershipCenter";
import { browserDb } from "@/lib/browser-db";

export default function MembershipPage() {
  const [accountId, setAccountId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    void browserDb().then(async (db) => {
      const { data } = await db.auth.getSession();
      if (active) setAccountId(data.session?.user.id || null);
    }).catch(() => { if (active) setAccountId(null); });
    return () => { active = false; };
  }, []);
  return <main className="page membership-route-page">
    <Link href="/" className="membership-route-back"><ArrowLeft size={17}/>返回黑卡</Link>
    <MembershipCenter tier="free" dailyAllowance={5} usedFlips={0} accountId={accountId}/>
  </main>;
}
