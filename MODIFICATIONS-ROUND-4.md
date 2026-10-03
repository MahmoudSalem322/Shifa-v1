# Round 4 updates

- Fixed prescription reader `soft is not defined` runtime error.
- Reduced browser OCR from the broken 10-pass loop to four valid passes (balanced/sharp × PSM 6/11) for faster reading.
- Prescription state is reset when the signed-in patient changes, including OCR transient state.
- Added server-side doctor deduplication to prevent duplicate doctor cards.
- Facility doctor list also filters legacy duplicates.
- Approved healthcare accounts can continue to edit their own approved profile and submit facility requests without a new admin approval for every request.
- Facility medicine requests remain unique for an open request, while admin receives a notification for visibility rather than an approval gate.
- Donation matching remains an admin-only action: the admin selects the approved donation, the drug request, and the recipient health facility/pharmacy, then the system notifies the selected recipient.
