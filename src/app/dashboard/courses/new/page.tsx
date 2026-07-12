import { CourseForm } from '@/features/courses/CourseForm';

export const metadata = { title: 'دورة جديدة | توثيق' };

export default function NewCoursePage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="heading-accent mb-6 text-2xl font-semibold text-primary">دورة جديدة</h1>
      <CourseForm />
    </div>
  );
}
