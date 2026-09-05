import { Schema } from 'mongoose';

const SectionSchema = new Schema({
  section_text: {
    type: String,
    required: true,
  },
  keywords_found: {
    type: [String],
    required: true,
  },
  embedding: {
    type: [Number],
    required: true,
  },
}, {
  timestamps: true, // optional, adds createdAt and updatedAt
});

import mongoose from 'mongoose';
const Section = mongoose.models.Section || mongoose.model('Section', SectionSchema);

export default Section; 