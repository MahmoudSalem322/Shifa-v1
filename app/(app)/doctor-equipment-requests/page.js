'use client';

import { PageBody, PageHeader, RoleGate } from '@/components/app-shell';
import { EquipmentRequestsManager } from '@/components/equipment-requests';

export default function DoctorEquipmentRequestsPage() {
  return (
    <>
      <PageHeader title="طلب معدات طبية" subtitle="اطلب أجهزة أو معدات تحتاجها لعملك لتصل مباشرة إلى المتبرعين" />
      <PageBody>
        <RoleGate allow={['Doctor']} message="هذه الصفحة مخصصة للأطباء فقط.">
          <EquipmentRequestsManager />
        </RoleGate>
      </PageBody>
    </>
  );
}
