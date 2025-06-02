import pandas as pd

# Load the dataset
df = pd.read_csv('airquality_by_county_last5.csv')

# Mapping of state abbreviations to full names
state_mapping = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
    "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
    "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho",
    "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
    "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
    "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
    "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
    "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
    "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah",
    "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia",
    "WI": "Wisconsin", "WY": "Wyoming", "DC": "District of Columbia", "PR": "Puerto Rico"
}

# Convert abbreviations into full names in a new column
df['State_Full'] = df['State'].map(state_mapping)

# Define healthy thresholds for each pollutant/statistic
thresholds = {
    ('CO', '2nd Max'): 9.0,
    ('NO2', 'Annual Mean'): 53.0,
    ('O3', '4th Max'): 0.070,
    ('PM10', '2nd Max'): 150.0,
    ('PM2.5', 'Weighted Annual Mean'): 12.0,
    ('SO2', '99th Percentile'): 75.0,
    ('Pb', 'Max 3-Month Average'): 0.15
}

# Keep only rows matching our chosen pollutant/statistic keys
filtered_df = df[df.set_index(['Pollutant', 'Trend Statistic'])
                   .index.isin(thresholds.keys())].copy()

# Compute ratio of county value to healthy threshold
filtered_df['Ratio'] = filtered_df.apply(
    lambda row: row['avg_last5'] / thresholds[(row['Pollutant'], row['Trend Statistic'])],
    axis=1
)

# Group by County + full state name, then average the ratios
score_df = (filtered_df
            .groupby(['County', 'State_Full'])['Ratio']
            .mean()
            .reset_index())

# Rename columns and save
score_df.rename(columns={'State_Full': 'State', 'Ratio': 'Air_Pollution_Score'}, inplace=True)
score_df.to_csv('air_pollution_score_fullstate.csv', index=False)

# Preview of results
print(score_df.head(10))
