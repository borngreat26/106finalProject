import pandas as pd

# Load your files
pollution_df = pd.read_csv('indus_pollution.csv')
cancer_df = pd.read_csv('cancer.csv')

# Check column names (just to confirm)
print("Pollution columns:", pollution_df.columns)
print("Cancer columns:", cancer_df.columns)

# Clean and standardize county names
pollution_df['county_clean'] = pollution_df['COUNTY'].str.lower().str.replace(' county', '').str.strip()
cancer_df['county_clean'] = cancer_df['county'].str.lower().str.split(',').str[0].str.replace(' county', '').str.strip()

# Merge datasets using cleaned county names
merged_df = pd.merge(
    cancer_df,
    pollution_df,
    on='county_clean',
    how='inner'
)

# Select and rename columns explicitly to avoid confusion
final_df = merged_df[['fips', 'pollution_index', 'incidence_rate']].rename(columns={
    'fips': 'FIPS',
    'pollution_index': 'pollution',
    'incidence_rate': 'incidents'
})

# Save the merged and cleaned data to a CSV
final_df.to_csv('merged_pollution_cancer.csv', index=False)

print("✅ Successfully created 'merged_pollution_cancer.csv'")