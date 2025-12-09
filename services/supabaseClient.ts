import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rqzsstwrgudurddoknqp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxenNzdHdyZ3VkdXJkZG9rbnFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyOTE2NzEsImV4cCI6MjA4MDg2NzY3MX0.Y2U-8bn-_-AAoQN0xsxW7ugcEHDGBeR_CPpoj7XJgGw';

export const supabase = createClient(supabaseUrl, supabaseKey);