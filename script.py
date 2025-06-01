import pandas as pd

# Load the dataset
df = pd.read_csv('airquality_by_county_last5.csv')

# Define the thresholds for each pollutant based on EPA standards
thresholds = {
    ('CO', '2nd Max'): 9.0,       # ppm
    ('NO2', 'Annual Mean'): 53.0, # ppb
    ('O3', '4th Max'): 0.070,     # ppm
    ('PM10', '2nd Max'): 150.0,   # µg/m³
    ('PM2.5', 'Weighted Annual Mean'): 12.0,  # µg/m³
    ('SO2', '99th Percentile'): 75.0,  # ppb
    ('Pb', 'Max 3-Month Average'): 0.15   # µg/m³
}

# Filter for the chosen pollutant metrics to include in the score
filtered_df = df[df.set_index(['Pollutant', 'Trend Statistic']).index.isin(thresholds.keys())]

# Compute the ratio of each pollutant value to its healthy threshold
filtered_df['Ratio'] = filtered_df.apply(lambda row: row['avg_last5'] / thresholds[(row['Pollutant'], row['Trend Statistic'])], axis=1)

# Aggregate by county and state to compute the average ratio (Air Pollution Score)
score_df = filtered_df.groupby(['County', 'State'])['Ratio'].mean().reset_index()
score_df.rename(columns={'Ratio': 'Air_Pollution_Score'}, inplace=True)

# Save the resulting DataFrame to a CSV file
output_path = 'air_pollution_data.csv'
score_df.to_csv(output_path, index=False)

