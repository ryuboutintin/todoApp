# SUPABASE 구성 가이드

## 목표
- 현재 `localStorage` 기반 Todo 앱을 Supabase 기반으로 전환한다.
- 지금은 단일 앱이지만, 나중에 사용자별 Todo 분리가 가능하도록 설계한다.
- 프론트엔드는 계속 순수 `HTML`, `CSS`, `JavaScript`로 유지한다.

## 결론 요약
- **권장 방식**: `todos` 단일 테이블 + `user_id` 컬럼 + Supabase Auth + RLS
- 이유:
  - 지금 구조와 가장 잘 맞는다.
  - 나중에 로그인 기능을 붙여도 DB 구조를 다시 뜯어고칠 필요가 적다.
  - Supabase를 브라우저에서 직접 사용할 때도 RLS로 안전하게 접근 제어가 가능하다.

## 가입 후 프로젝트를 만들 때 추천 설정

### 1. 프로젝트 생성
- Organization 생성
- New project 생성
- 프로젝트 이름 예시: `todo-app`
- 데이터베이스 비밀번호는 별도 보관
- Region은 실제 사용자와 가까운 곳으로 선택
  - 한국에서 주로 쓸 앱이면 한국/동아시아와 가까운 리전을 우선 검토

### 2. 기본으로 사용할 Supabase 기능
- `Database`: Todo 저장
- `Auth`: 사용자별 Todo 분리
- `API`: 브라우저에서 `supabase-js`로 접근

### 3. 지금 단계에서 굳이 안 써도 되는 기능
- `Storage`: 첨부파일 없으면 불필요
- `Edge Functions`: 현재 CRUD만 있으면 불필요
- `Realtime`: 실시간 협업이 필요해질 때 추가

## 인증 전략 추천

### 추천: Auth 사용
- 사용자 회원가입/로그인을 붙인다.
- 이메일 로그인과 Google, GitHub 소셜 로그인을 함께 사용한다.
- 각 Todo는 `auth.users.id`와 연결한다.
- 한 사용자는 자기 Todo만 조회/수정/삭제할 수 있게 RLS를 건다.

### 왜 익명 공용 테이블은 비추천인가
- 지금은 편해 보여도, 브라우저에 공개되는 키로 모두가 같은 데이터를 보게 될 위험이 크다.
- 익명 사용자 전체가 하나의 Todo 목록을 공유하면 삭제/수정 충돌이 생긴다.
- 나중에 로그인 구조로 바꿀 때 마이그레이션 비용이 커진다.

### 타협안
- 회원가입 전 체험이 필요하면:
  - 첫 단계는 기존 `localStorage` 유지
  - 로그인 이후에만 Supabase 동기화
- 또는 Supabase Auth의 anonymous sign-in을 검토할 수 있지만, 현재 앱 목적상 우선순위는 낮다.

## 추천 테이블 구조

현재 앱 데이터:

```js
{ id, text, completed, priority, order }
```

Supabase에서는 아래처럼 바꾸는 것을 권장한다:

### `todos` 테이블

| 컬럼명 | 타입 | 설명 |
| --- | --- | --- |
| `id` | `uuid` | Todo PK |
| `user_id` | `uuid` | `auth.users.id` 참조 |
| `text` | `text` | 할 일 내용 |
| `completed` | `boolean` | 완료 여부 |
| `priority` | `text` | `high`, `medium`, `low` 중 하나 |
| `sort_order` | `integer` | 같은 priority 안에서의 정렬 순서 |
| `created_at` | `timestamptz` | 생성 시각 |
| `updated_at` | `timestamptz` | 수정 시각 |

## 왜 이렇게 설계하는가
- `id`
  - 현재는 `Date.now()`를 쓰지만, DB에서는 `uuid`가 더 안전하다.
- `user_id`
  - 사용자별 데이터 분리의 핵심이다.
- `priority`
  - 현재 UI 로직을 그대로 옮기기 쉽다.
- `sort_order`
  - 현재 `order` 필드 역할을 그대로 담당한다.
  - 드래그 앤 드롭 결과를 반영하기 쉽다.
- `created_at`, `updated_at`
  - 정렬, 디버깅, 변경 추적에 유리하다.

## SQL 초안

아래 SQL은 Supabase SQL Editor에서 실행하는 기준이다.

```sql
create extension if not exists pgcrypto;

create table public.todos (
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

create index todos_user_id_idx on public.todos (user_id);
create index todos_user_priority_order_idx on public.todos (user_id, priority, sort_order);

alter table public.todos enable row level security;
```

## RLS 정책 초안

사용자는 자기 Todo만 다룰 수 있게 제한한다.

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

## `updated_at` 자동 갱신 트리거

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

create trigger set_todos_updated_at
before update on public.todos
for each row
execute function public.set_updated_at();
```

## 조회/정렬 기준

현재 앱은 우선순위 컬럼별로 나누고, 각 컬럼 안에서 `order`로 정렬한다.

Supabase에서는 아래 기준으로 조회하면 된다.

```sql
select *
from public.todos
where user_id = auth.uid()
order by
  case priority
    when 'high' then 1
    when 'medium' then 2
    when 'low' then 3
    else 4
  end,
  sort_order asc,
  created_at asc;
```

실제 프론트에서는 보통 `priority`별로 나눈 뒤 `sort_order`로 정렬하면 충분하다.

## 현재 앱과의 매핑

| 현재 필드 | Supabase 필드 | 비고 |
| --- | --- | --- |
| `id` | `id` | `number` -> `uuid` |
| `text` | `text` | 동일 |
| `completed` | `completed` | 동일 |
| `priority` | `priority` | 동일 |
| `order` | `sort_order` | 이름만 변경 권장 |

추가되는 필드:
- `user_id`
- `created_at`
- `updated_at`

## 소셜 로그인 추가 설정

### 1. Provider 활성화
- Supabase Dashboard `Authentication > Providers`에서 `Google`, `GitHub`를 켠다.
- 각 Provider에 발급받은 Client ID / Client Secret을 입력한다.

### 2. Redirect URL 등록
- Supabase Dashboard `Authentication > URL Configuration`에서 아래 URL을 등록한다.
  - 로컬 개발 URL 예: `http://localhost:8001`
  - 운영 배포 URL 예: `https://your-app.netlify.app`
- 클라이언트에서는 `signInWithOAuth()` 호출 시 현재 origin + pathname을 `redirectTo`로 넘긴다.

### 3. 계정 정책
- v1에서는 이메일 로그인 계정과 소셜 로그인 계정을 자동 링크하지 않는다.
- 같은 이메일로 각각 가입되더라도 별도 계정으로 취급될 수 있으므로, 운영 문서와 UI 안내 문구에 이를 반영한다.

## 프론트엔드 연결 시 추천 흐름

### 1. 초기 로드
- 로그인 사용자 확인
- `todos` 조회
- `priority`와 `sort_order` 기준으로 렌더링

### 2. Todo 추가
- `insert`
- `sort_order`는 해당 priority의 마지막 값 + 1

### 3. 완료 토글
- `update completed = !completed`

### 4. 우선순위 변경
- 대상 Todo의 `priority` 변경
- 대상 priority 그룹의 `sort_order` 재정렬

### 5. 드래그 앤 드롭 재정렬
- 같은 priority 안에서 순서가 바뀌면 해당 그룹의 `sort_order`를 다시 저장
- 다른 priority로 이동하면:
  - 원래 그룹 재정렬
  - 새 그룹 재정렬
  - 이동한 Todo의 `priority` 업데이트

### 6. 소셜 로그인
- 로그인 화면에서 Google 또는 GitHub 버튼 클릭
- `supabase.auth.signInWithOAuth()`로 공급자 로그인 페이지로 이동
- 인증 후 등록된 `redirectTo` URL로 복귀
- 세션이 생기면 기존 `applySession()` 흐름으로 Todo를 불러온다

## 정렬 저장 방식 제안

### 권장: 재정렬 시 그룹 전체 `sort_order`를 다시 저장
- 예: high priority 목록이 5개면 `0,1,2,3,4`로 다시 부여
- 장점:
  - 현재 `normalizeOrders()` 로직과 매우 유사
  - 구현이 단순하다
- 단점:
  - 이동 한 번에 여러 row update가 발생한다

현재 앱 규모에서는 이 방식이 가장 단순하고 안정적이다.

## 확장 가능 구조

지금은 `todos` 한 테이블이면 충분하다. 다만 이후 아래 확장은 가능하다.

### 선택 확장 1: `profiles` 테이블
- 사용자 닉네임, 설정 등을 보관
- 지금 당장은 없어도 된다

### 선택 확장 2: `priority`를 enum으로 변경
- 현재는 `check constraint`로 충분
- enum은 엄격하지만 초기 변경이 더 번거롭다

### 선택 확장 3: `deleted_at`
- 휴지통 기능이 필요할 때 soft delete 용도로 추가

## 추천하지 않는 구조

### 1. priority별 테이블 분리
- `todos_high`, `todos_medium`, `todos_low` 같은 구조
- 쿼리와 이동 로직이 복잡해진다

### 2. 사용자 구분 없는 공용 `todos` 테이블
- 브라우저 공개 키 환경에서 위험하다
- 실서비스 구조로 부적절하다

### 3. `order`를 전역 단일 순서로만 관리
- 현재 UI는 priority 컬럼별 정렬이 핵심이라 맞지 않는다

## 실제 작업 순서 제안

1. Supabase 가입
2. 새 프로젝트 생성
3. Auth 사용 여부 결정
   - 권장: 사용
4. SQL Editor에서 테이블/정책 생성
5. 프로젝트 URL, publishable key 확인
6. 프론트에 `supabase-js` 연결
7. 기존 `localStorage` 로직을 Supabase CRUD로 교체
8. 필요하면 최초 1회 `localStorage` -> Supabase 마이그레이션 추가

## 이 앱 기준 최종 추천안

- Supabase Auth를 켠다.
- `public.todos` 단일 테이블을 만든다.
- `user_id`, `text`, `completed`, `priority`, `sort_order`, `created_at`, `updated_at` 구조로 간다.
- RLS를 반드시 켠다.
- 드래그 앤 드롭 이후에는 해당 priority 그룹의 `sort_order`를 다시 0부터 저장한다.

이 구성이 현재 앱 구조와 가장 잘 맞고, 이후 멀티 유저 앱으로 확장하기도 가장 쉽다.

## 참고 문서
- Supabase Docs: https://supabase.com/docs
- Auth: https://supabase.com/docs/guides/auth
- Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- API keys: https://supabase.com/docs/guides/getting-started/api-keys
