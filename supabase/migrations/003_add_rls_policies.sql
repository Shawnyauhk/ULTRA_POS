-- Add missing RLS policies for INSERT/UPDATE on order_requests and related tables

-- Allow authenticated users to insert order requests
CREATE POLICY "Allow authenticated users to insert order_requests"
  ON order_requests FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update order_requests
CREATE POLICY "Allow authenticated users to update order_requests"
  ON order_requests FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to insert order_request_items
CREATE POLICY "Allow authenticated users to insert order_request_items"
  ON order_request_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to read order_request_items
CREATE POLICY "Allow authenticated users to read order_request_items"
  ON order_request_items FOR SELECT
  TO authenticated
  USING (true);
