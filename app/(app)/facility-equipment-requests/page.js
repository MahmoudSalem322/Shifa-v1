'use client';

import { PageBody, PageHeader, RoleGate } from '@/components/app-shell';
import { EquipmentRequestsManager } from '@/components/equipment-requests';

export default function FacilityEquipmentRequestsPage() {
  return (
    <>
      <PageHeader title="طلبات المعدات" subtitle="اطلب أجهزة أو معدات طبية لتصل مباشرة إلى المتبرعين" />
      <PageBody>
        <RoleGate allow={['Hospital']} message="هذه الصفحة مخصصة للمراكز الصحية والمستشفيات فقط.">
          <EquipmentRequestsManager />
        </RoleGate>
      </PageBody>
    </>
  );
}
