import { useState } from "react";
import { Building2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type Props = { initialName?: string; initialOrganization?: string; onComplete: () => void | Promise<void> };

export default function OrganizationOnboarding({ initialName = "", initialOrganization = "", onComplete }: Props) {
  const [fullName, setFullName] = useState(initialName);
  const [organizationName, setOrganizationName] = useState(initialOrganization);
  const complete = trpc.onboarding.complete.useMutation({
    onSuccess: () => { toast.success("Organization workspace created"); onComplete(); },
    onError: (error) => toast.error("Onboarding could not be completed", { description: error.message }),
  });

  return <main className="auth-page"><section className="auth-card onboarding-card"><div className="brand-lockup auth-brand"><div className="brand-mark"><span aria-hidden="true" className="brand-mark-glyph">V</span></div><div><div className="brand-name">VahanSync</div><div className="brand-tag">Fleet intelligence for India’s operators</div></div></div><div className="onboarding-step"><span>01</span><span>Superadmin setup</span></div><h1>Set up your organization.</h1><p>Create the first tenant workspace. You will become its Superadmin and can invite fleet managers, mechanics, drivers, and accountants next.</p><form className="auth-form" onSubmit={(event) => { event.preventDefault(); complete.mutate({ fullName: fullName.trim(), orgName: organizationName.trim() }); }}><label>Your full name<input required minLength={2} value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Arjun Shah" /></label><label>Organization name<input required minLength={2} value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} placeholder="Your organization name" /></label><div className="onboarding-security"><ShieldCheck size={17} /><span>Tenant isolation and role permissions are enforced by Supabase RLS and the VahanSync API.</span></div><button className="primary-button" disabled={complete.isPending}><Building2 size={16} />{complete.isPending ? "Creating workspace…" : "Create organization"}</button></form></section></main>;
}
