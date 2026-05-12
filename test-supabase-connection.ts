import { supabase } from './src/lib/supabase.ts';

async function testConnection() {
  console.log('🧪 Testing Supabase Connection...\n');
  
  try {
    // Test 1: Check restaurants table
    console.log('1️⃣ Testing restaurants table...');
    const { data: restaurants, error: restaurantsError } = await supabase
      .from('restaurants')
      .select('*');
    
    if (restaurantsError) {
      console.error('❌ Restaurants query failed:', restaurantsError.message);
    } else {
      console.log(`✅ Restaurants table accessible. Found ${restaurants?.length || 0} restaurant(s).`);
      if (restaurants && restaurants.length > 0) {
        console.log(`   Restaurant: ${restaurants[0].name}`);
      }
    }

    // Test 2: Check employees table
    console.log('\n2️⃣ Testing employees table...');
    const { data: employees, error: employeesError } = await supabase
      .from('employees')
      .select('*');
    
    if (employeesError) {
      console.error('❌ Employees query failed:', employeesError.message);
    } else {
      console.log(`✅ Employees table accessible. Found ${employees?.length || 0} employee(s).`);
    }

    // Test 3: Check products table
    console.log('\n3️⃣ Testing products table...');
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*');
    
    if (productsError) {
      console.error('❌ Products query failed:', productsError.message);
    } else {
      console.log(`✅ Products table accessible. Found ${products?.length || 0} product(s).`);
    }

    // Test 4: Check inventory table
    console.log('\n4️⃣ Testing inventory table...');
    const { data: inventory, error: inventoryError } = await supabase
      .from('inventory')
      .select('*');
    
    if (inventoryError) {
      console.error('❌ Inventory query failed:', inventoryError.message);
    } else {
      console.log(`✅ Inventory table accessible. Found ${inventory?.length || 0} inventory item(s).`);
    }

    // Test 5: Check settings table (might not exist yet)
    console.log('\n5️⃣ Testing settings table...');
    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('*');
    
    if (settingsError) {
      console.warn('⚠️ Settings table might not exist yet. Run migration 003 if needed.');
    } else {
      console.log(`✅ Settings table accessible. Found ${settings?.length || 0} setting(s).`);
    }

    // Summary
    console.log('\n========== CONNECTION TEST SUMMARY ==========\n');
    
    const hasErrors = restaurantsError || employeesError || productsError || inventoryError;
    
    if (hasErrors) {
      console.log('❌ Some tests failed. Please check the errors above.');
      console.log('\n💡 Common solutions:');
      console.log('   1. Ensure you have run the migration scripts in Supabase SQL Editor');
      console.log('   2. Check that RLS policies are properly configured');
      console.log('   3. Verify your .env file has the correct Supabase URL and ANON_KEY');
    } else {
      console.log('✅ All Supabase connection tests passed!');
      console.log('\n📊 Database Summary:');
      console.log(`   • Restaurants: ${restaurants?.length || 0}`);
      console.log(`   • Employees: ${employees?.length || 0}`);
      console.log(`   • Products: ${products?.length || 0}`);
      console.log(`   • Inventory Items: ${inventory?.length || 0}`);
    }
    
    console.log('\n==============================================\n');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    console.log('\n💡 Please check:');
    console.log('   1. Your internet connection');
    console.log('   2. The Supabase project status at https://supabase.com/dashboard');
    console.log('   3. The .env file configuration');
  }
}

testConnection();
