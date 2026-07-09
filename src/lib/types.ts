export type Person = {
  id: string;
  name: string;
  avatar_url: string | null;
  created_at: string;
};

export type Thanks = {
  id: string;
  from_person_id: string;
  to_person_id: string;
  reason: string;
  source: "slack" | "web" | "seed";
  created_at: string;
};

export type ThanksWithPeople = Thanks & {
  from_person: Person;
  to_person: Person;
};

export type PersonWithStats = Person & {
  thanks_received: number;
  thanks_given: number;
};
