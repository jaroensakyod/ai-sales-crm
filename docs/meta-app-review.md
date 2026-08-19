# Meta App Review — submission pack (Messenger + Instagram)

Copy the English blocks into each field in the App Review form. Thai notes (▸) are
for you, not for Meta.

App: **Mumate Messenger** · Platform: `https://ai-sales-crm-eta.vercel.app`
Category: Business / Messaging.

---

## 0. App / business description (Meta "App details")

> Mumate is an AI sales-assistant CRM for small businesses in Thailand. A
> merchant connects their own Facebook Page and Instagram professional account,
> and our AI assistant automatically replies to customer messages: answering
> product questions, sending product cards, taking orders, and relaying the
> shop's own payment details. Every Page/IG account is connected by its own
> owner through Facebook Login; we only act on Pages the owner explicitly grants.

▸ ใส่ในส่วนอธิบายแอพทั่วไป / "How does your app use Facebook data?"

---

## 1. pages_messaging

**How your app uses it**
> We use pages_messaging to receive messages customers send to the merchant's
> Facebook Page and to send the AI assistant's replies back to those customers
> within the standard messaging window. This is the core function of the app:
> automated, human-like customer support and sales conversations on the
> merchant's own Page. We never message users who have not messaged the Page
> first.

**Steps for the reviewer to test** (see shared test steps in §6)

▸ นี่คือสิทธิ์หลัก ต้องได้ ไม่งั้นบอทตอบ Messenger ไม่ได้

---

## 2. pages_manage_metadata

**How your app uses it**
> We use pages_manage_metadata to subscribe the merchant's Page to our webhook
> automatically at the moment they connect it, so the merchant does not have to
> configure webhooks manually in the App Dashboard. It is used only to register
> the messaging webhook for a Page the owner has just authorized.

▸ ใช้ subscribe เพจเข้า webhook อัตโนมัติ (ลูกค้าจะได้ไม่ต้องเข้า console)

---

## 3. pages_show_list

**How your app uses it**
> During onboarding, the merchant signs in with Facebook Login and we use
> pages_show_list to display the Pages they manage so they can choose which Page
> to connect to their store. We only read the list of Pages the person
> administers; we do not access Pages they have not selected.

▸ ใช้ตอน OAuth ให้ลูกค้าเลือกเพจตัวเอง

---

## 4. instagram_basic

**How your app uses it**
> We use instagram_basic to read the basic profile (account id, username) of the
> Instagram professional account linked to the connected Page, so we can identify
> the account and show the merchant which IG account is connected in their
> dashboard.

▸ อ่านข้อมูล IG พื้นฐาน (ระบุบัญชี IG ที่เชื่อม)

---

## 5. instagram_manage_messages

**How your app uses it**
> We use instagram_manage_messages to receive Instagram Direct messages sent to
> the merchant's connected professional account and to send the AI assistant's
> replies, giving Instagram customers the same automated support as Messenger.
> We only respond to users who have messaged the account first.

▸ รับ/ตอบ IG DM (บอทตอบ IG เหมือน FB)

---

## 6. Test instructions for the reviewer (shared)

> Test credentials are provided in the App Review "Test user / credentials"
> field. To reproduce:
> 1. Open the dashboard at https://ai-sales-crm-eta.vercel.app and sign in with
>    the provided test account.
> 2. Go to Settings → "Connect Facebook Page", click "Connect Facebook", log in,
>    and select the test Page. The Page is connected and its webhook subscribed
>    automatically.
> 3. From any Facebook account, open the connected Page and send it a message
>    such as "ราคาเท่าไหร่" (how much is it?) or "What products do you have?".
>    The AI assistant replies within a few seconds with product information.
> 4. For Instagram: the test Page has a linked IG professional account. Send a
>    Direct message to that IG account; the AI assistant replies the same way.

▸ อย่าลืมสร้าง test user + ใส่รหัสในช่อง credentials / เตรียมเพจทดสอบที่บอทตอบได้จริง

---

## 7. Demo video script (screen recording, ~60–90s)

Record your screen (Thai UI is fine; add English captions if you can).

1. **(0–10s) App intro** — Show the Mumate dashboard overview. Caption:
   "Mumate — AI sales assistant. Merchants connect their own Page & Instagram."
2. **(10–25s) Connect a Page** — Settings → click "Connect Facebook" → Facebook
   login dialog → choose the Page → back to dashboard showing "connected".
   Caption: "The merchant connects their own Page via Facebook Login
   (pages_show_list, pages_manage_metadata)."
3. **(25–45s) Messenger reply** — Open the Page in Messenger, send "ราคาเท่าไหร่"
   → show the AI reply appear. Caption: "Customer messages the Page; the assistant
   replies (pages_messaging)."
4. **(45–65s) Instagram reply** — Open the linked IG account, send a DM → show the
   AI reply. Caption: "Same on Instagram DM (instagram_basic,
   instagram_manage_messages)."
5. **(65–75s) Close** — Show the conversation + a created order in the dashboard.
   Caption: "All replies are automated on the merchant's own accounts."

▸ ถ่ายจริงจากเพจ/ไอจีของคุณเอง (dev mode ทำได้) ให้เห็นข้อความเข้า→บอทตอบชัดๆ

---

## 8. Before you submit — checklist

- [ ] Business Verification completed (Business Settings → Security Center)
- [ ] App is Live/Published (done)
- [ ] Bot actually replies on your own Page AND IG DM (reviewers will test)
- [ ] Privacy Policy URL: https://ai-sales-crm-eta.vercel.app/privacy
- [ ] Terms URL: https://ai-sales-crm-eta.vercel.app/terms
- [ ] Data deletion instructions: https://ai-sales-crm-eta.vercel.app/data-processing
- [ ] Test account credentials filled in the review form
- [ ] Demo video uploaded (covers FB + IG)
- [ ] All 5 permissions requested in ONE submission
