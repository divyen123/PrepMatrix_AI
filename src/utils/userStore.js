const CLASS_OPTIONS = [
  ...Array.from({ length: 12 }, (_, index) => `Class ${index + 1}`),
  "College",
];

const TRACK_OPTIONS = [
  "General",
  "CBSE",
  "State Board",
  "ICSE",
  "Engineering",
  "Degree",
  "Diploma",
  "Competitive Exam",
];

const DEPARTMENT_OPTIONS = [
  "Computer Science",
  "Information Technology",
  "Electronics",
  "Electrical",
  "Mechanical",
  "Civil",
  "Artificial Intelligence",
  "Data Science",
  "Commerce",
  "Business Administration",
  "Arts",
  "Science",
  "Other",
];

export { CLASS_OPTIONS, DEPARTMENT_OPTIONS, TRACK_OPTIONS };
