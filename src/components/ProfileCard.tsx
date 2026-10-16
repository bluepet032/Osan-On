import { useState, type FormEvent } from 'react'
import { hasBasics, HOUSEHOLD_OPTIONS, INCOME_OPTIONS, TRAIT_OPTIONS, type IncomeCode, type Profile } from '../eligibility'

interface Props { profile: Profile; onChange: (profile: Profile) => void }

const TRAIT_GROUPS: [string, string[]][] = [
  ['임신·출산', ['JA0301', 'JA0302', 'JA0303']],
  ['직업·학적', ['JA0317', 'JA0318', 'JA0319', 'JA0320', 'JA0326', 'JA0327', 'JA0313', 'JA0314', 'JA0315', 'JA0316', 'JA1101', 'JA1102', 'JA1103']],
  ['특수 대상', ['JA0328', 'JA0329', 'JA0330']],
]

const toggle = (list: string[], code: string) => list.includes(code) ? list.filter(value => value !== code) : [...list, code]

export function ProfileCard({ profile, onChange }: Props) {
  const [editing, setEditing] = useState(!hasBasics(profile))
  const [details, setDetails] = useState(false)
  const [gender, setGender] = useState(profile.gender)
  const [age, setAge] = useState(profile.age == null ? '' : String(profile.age))
  const [income, setIncome] = useState(profile.income ?? '')
  const [traits, setTraits] = useState(profile.traits ?? [])
  const [household, setHousehold] = useState(profile.household ?? [])
  const ageNumber = Number(age)
  const validAge = age.trim() !== '' && Number.isInteger(ageNumber) && ageNumber >= 0 && ageNumber <= 120

  const submitBasics = (event: FormEvent) => {
    event.preventDefault()
    if (!gender || !validAge) return
    onChange({ ...profile, gender, age: ageNumber })
    setEditing(false)
  }
  const submitDetails = (event: FormEvent) => {
    event.preventDefault()
    // Saving the detail form answers every group: unchecked boxes mean "does not apply".
    onChange({ ...profile, income: (income || undefined) as IncomeCode | undefined, traits, household })
    setDetails(false)
  }
  const checkbox = (code: string, label: string, list: string[], set: (next: string[]) => void) => (
    <label key={code} className="profile-check"><input type="checkbox" checked={list.includes(code)} onChange={() => set(toggle(list, code))} />{label}</label>
  )

  if (editing) {
    return (
      <form className="profile-card" onSubmit={submitBasics} aria-label="맞춤 혜택 설문">
        <div><strong>나에게 맞는 혜택 찾기</strong><p>성별과 나이만 알려 주시면 오산시·경기도·중앙정부 혜택 중 해당할 가능성이 높은 것을 골라 드립니다.</p></div>
        <div className="profile-fields">
          <div role="radiogroup" aria-label="성별" className="profile-gender">
            <label><input type="radio" name="gender" checked={gender === 'female'} onChange={() => setGender('female')} />여성</label>
            <label><input type="radio" name="gender" checked={gender === 'male'} onChange={() => setGender('male')} />남성</label>
          </div>
          <label className="profile-age">만 나이<input type="number" inputMode="numeric" min={0} max={120} value={age} onChange={event => setAge(event.target.value)} /></label>
          <button type="submit" className="primary-button" disabled={!gender || !validAge}>맞춤 혜택 보기</button>
        </div>
        <small>입력한 정보는 이 브라우저에만 저장되며 서버로 보내지 않습니다.</small>
      </form>
    )
  }

  return (
    <section className="profile-card" aria-label="내 조건">
      <div className="profile-summary">
        <strong>{profile.gender === 'male' ? '남성' : '여성'} · 만 {profile.age}세</strong>
        <button type="button" className="text-button" onClick={() => setEditing(true)}>수정</button>
        <button type="button" className="text-button" onClick={() => setDetails(value => !value)} aria-expanded={details}>더 정확하게</button>
      </div>
      {details && (
        <form className="profile-details" onSubmit={submitDetails}>
          <label className="profile-income">소득 수준
            <select value={income} onChange={event => setIncome(event.target.value)}>
              <option value="">모름·입력 안 함</option>
              {Object.entries(INCOME_OPTIONS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
          </label>
          {TRAIT_GROUPS.map(([title, codes]) => (
            <fieldset key={title}><legend>{title}</legend>{codes.map(code => checkbox(code, TRAIT_OPTIONS[code], traits, setTraits))}</fieldset>
          ))}
          <fieldset><legend>가구 상황</legend>{Object.entries(HOUSEHOLD_OPTIONS).map(([code, label]) => checkbox(code, label, household, setHousehold))}</fieldset>
          <p className="profile-hint">체크하지 않은 항목은 '해당 없음'으로 판정합니다. 소득을 모르면 소득 조건이 있는 혜택은 '확인 필요'로 보여 드립니다.</p>
          <button type="submit" className="primary-button">저장</button>
        </form>
      )}
    </section>
  )
}
