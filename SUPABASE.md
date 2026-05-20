# SUPABASE 구성 가이드

## 현재 상태
- 이 앱은 이미 Supabase 기반으로 동작한다.
- 인증은 Supabase Auth를 사용한다.
- Todo 저장은 Supabase `public.todos` 테이블을 사용한다.
- 프론트엔드는 계속 순수 `HTML`, `CSS`, `JavaScript`로 유지한다.
- 기존 `localStorage["todos"]` 데이터는 마이그레이션하지 않고, 앱 시작 시 정리만 한다.

## 현재 구현 요약
- `index.html`은 `@supabase/supabase-js@2`를 CDN으로 로드한다.
- `script.js`는 아래 값을 사용해 클라이언트를 초기화한다.
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
- 로그인 전에는 인증 패널만 노출된다.
- 로그인 후에는 사용자별 Todo 목록만 조회하고 수정한다.
- Google/GitHub OAuth 로그인 중에는 `sessionStorage["pending-oauth-provider"]`로 리다이렉트 상태를 추적한다.
- 인증 상태 반영은 `supabase.auth.onAuthStateChange()`와 초기 `getSession()` 호출로 처리한다.

## 인증 방식

### 이메일 로그인
- `signUp()`으로 회원가입을 요청한다.
- 회원가입 후 세션이 생기더라도 즉시 `signOut()` 해서 인증 메일 확인 후 다시 로그인하게 만든다.
- `Confirm email`이 켜져 있어야 현재 UX와 맞는다.
- `signInWithPassword()`는 인증 완료된 이메일 계정만 정상 로그인된다.

### 소셜 로그인
- 지원 Provider는 `google`, `github` 두 가지다.
- `signInWithOAuth()` 호출 시 `redirectTo`는 현재 페이지의 `origin + pathname`이다.
- Supabase `Redirect URLs`에 로컬 URL과 운영 URL이 모두 등록돼 있어야 한다.
- 같은 이메일이어도 이메일 로그인 계정과 소셜 로그인 계정은 별도 계정처럼 보일 수 있다.

## 데이터 모델

### 클라이언트 메모리 구조
```js
{ id, text, completed, priority, order }
```

### Supabase 테이블 구조

| 컬럼명 | 타입 | 설명 |
| --- | --- | --- |
| `id` | `uuid` | Todo PK |
| `user_id` | `uuid` | `auth.users.id` 참조 |
| `text` | `text` | 할 일 내용 |
| `completed` | `boolean` | 완료 여부 |
| `priority` | `text` | `high`, `medium`, `low` |
| `sort_order` | `integer` | 같은 priority 안에서의 정렬 순서 |
| `created_at` | `timestamptz` | 생성 시각 |
| `updated_at` | `timestamptz` | 수정 시각 |

### 필드 매핑

| 클라이언트 필드 | Supabase 필드 | 비고 |
| --- | --- | --- |
| `id` | `id` | DB에서 uuid 사용 |
| `text` | `text` | 동일 |
| `completed` | `completed` | 동일 |
| `priority` | `priority` | 동일 |
| `order` | `sort_order` | 렌더링 전 `order`로 정규화 |

## 현재 동기화 방식
- 조회 시 `select("id, text, completed, priority, sort_order")`로 현재 사용자 Todo만 읽는다.
- 조회 결과는 `normalizeTodoRecord()`와 `normalizeOrders()`를 거쳐 컬럼별 연속 순번으로 다시 맞춘다.
- Todo 추가 시 선택한 priority 컬럼의 마지막 순번 뒤에 삽입한다.
- 완료 토글, 우선순위 변경, 드래그 정렬, 삭제 후에는 클라이언트 배열을 먼저 정규화하고 Supabase에 반영한다.
- 재정렬 저장은 부분 갱신이 아니라 관련 Todo들의 `sort_order`를 다시 맞춘 뒤 `upsert(..., { onConflict: "id" })`로 밀어 넣는 방식이다.
- 삭제는 `delete().eq("id", id).eq("user_id", currentUserId)` 후 남은 항목을 다시 동기화한다.

## 필요한 SQL

### 테이블 생성
```sql
create extension if not exists pgcrypto;

create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  text text not null,
  completed boolean not null default false,
  priority text not null default 'medium',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint todos_priority_check
    check (priority in ('high', 'medium', 'low')),

  constraint todos_text_not_blank
    check (char_length(trim(text)) > 0)
);

create index if not exists todos_user_id_idx
on public.todos (user_id);

create index if not exists todos_user_priority_order_idx
on public.todos (user_id, priority, sort_order);

alter table public.todos enable row level security;
```

### RLS 정책
```sql
create policy "Users can view their own todos"
on public.todos
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own todos"
on public.todos
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own todos"
on public.todos
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own todos"
on public.todos
for delete
to authenticated
using (auth.uid() = user_id);
```

### `updated_at` 트리거
```sql
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_todos_updated_at on public.todos;

create trigger set_todos_updated_at
before update on public.todos
for each row
execute function public.set_updated_at();
```

## Auth 설정 체크리스트
- `Authentication > Providers > Email` 활성화
- `Confirm email` 활성화
- `Authentication > Providers > Google` 활성화 및 Client ID/Secret 입력
- `Authentication > Providers > GitHub` 활성화 및 Client ID/Secret 입력
- `Authentication > URL Configuration`에 아래 URL 등록
  - 로컬 예: `http://localhost:8001`
  - 운영 예: 실제 배포 주소

## 주의사항
- 현재 anon key는 클라이언트 코드에 포함되어 있으므로 RLS가 필수다.
- Supabase 기본 메일 발송 한도에 걸리면 회원가입 직후 인증 메일이 바로 다시 발송되지 않을 수 있다.
- `file://`로 열면 OAuth 리다이렉트와 세션 처리가 불안정해질 수 있다.
- CDN으로 Supabase 스크립트를 받아오므로 네트워크 차단 환경에서는 클라이언트 초기화가 실패할 수 있다.
